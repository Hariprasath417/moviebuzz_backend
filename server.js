// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
const MONGO_URI = process.env.MONGO_URI || process.env.REACT_APP_MONGO_URI;
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("✅ MongoDB connected successfully!"))
    .catch(err => console.error("❌ MongoDB connection error:", err));

/* ===========================================================
   Mongoose Schemas & Models
   =========================================================== */

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    profilePicture: String,
    joinDate: { type: Date, default: Date.now },
    watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }]
});
const User = mongoose.model('User', userSchema);

const movieSchema = new mongoose.Schema({
    title: String,
    genre: [String],
    releaseYear: Number,
    director: String,
    cast: [String],
    synopsis: String,
    posterUrl: String,
    averageRating: { type: Number, default: 0 }
});
const Movie = mongoose.model('Movie', movieSchema);

const reviewSchema = new mongoose.Schema({
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: String,
    createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.model('Review', reviewSchema);

const diarySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true },
    watchedDate: { type: Date, required: true },
    rating: Number,
    reviewText: String,
});
const Diary = mongoose.model('Diary', diarySchema);

/* ===========================================================
   Auth Routes
   =========================================================== */

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User with this email already exists." });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const username = email.split('@')[0];
        const newUser = new User({ email, password: hashedPassword, username });
        await newUser.save();
        res.status(201).json({ message: "User created successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Something went wrong." });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found." });

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) return res.status(400).json({ message: "Invalid credentials." });

        const token = jwt.sign({ email: user.email, id: user._id }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '1h' });
        res.status(200).json({ result: { id: user._id, email: user.email }, token });
    } catch (error) {
        res.status(500).json({ message: "Something went wrong." });
    }
});

/* ===========================================================
   Movie Routes
   =========================================================== */

// Get all movies (with filters + pagination)
app.get('/api/movies', async (req, res) => {
    try {
        const { page = 1, limit = 10, genre, year, rating } = req.query;
        const query = {};
        if (genre) query.genre = genre;
        if (year) query.releaseYear = year;
        if (rating) query.averageRating = { $gte: rating };

        const movies = await Movie.find(query)
            .skip((page - 1) * limit)
            .limit(Number(limit));

        res.json(movies);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get specific movie + reviews
app.get('/api/movies/:id', async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).json({ message: "Movie not found" });

        const reviews = await Review.find({ movieId: movie._id }).populate("userId", "username");
        res.json({ movie, reviews });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add a new movie (Admin only placeholder)
app.post('/api/movies', async (req, res) => {
    try {
        const newMovie = new Movie(req.body);
        await newMovie.save();
        res.status(201).json(newMovie);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

/* ===========================================================
   Review Routes
   =========================================================== */

// Get reviews for a movie
app.get('/api/movies/:id/reviews', async (req, res) => {
    try {
        const reviews = await Review.find({ movieId: req.params.id }).sort({ createdAt: -1 });
        res.json(reviews);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add review to a movie
app.post('/api/movies/:id/reviews', async (req, res) => {
    try {
        const { userId, username, rating, text } = req.body;
        const review = new Review({ movieId: req.params.id, userId, username, rating, text });
        await review.save();

        // Update average rating
        const reviews = await Review.find({ movieId: req.params.id });
        const avg = reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;
        await Movie.findByIdAndUpdate(req.params.id, { averageRating: avg });

        res.status(201).json(review);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

/* ===========================================================
   User Routes (Profile + Watchlist + Diary)
   =========================================================== */

// Get user profile
app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate("watchlist");
        res.json(user);
    } catch (err) {
        res.status(404).json({ message: "User not found" });
    }
});

// Update user profile
app.put('/api/users/:id', async (req, res) => {
    try {
        const updated = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Watchlist
app.get('/api/users/:id/watchlist', async (req, res) => {
    const user = await User.findById(req.params.id).populate("watchlist");
    res.json(user.watchlist);
});

app.post('/api/users/:id/watchlist', async (req, res) => {
    const { movieId } = req.body;
    const user = await User.findById(req.params.id);
    if (!user.watchlist.includes(movieId)) user.watchlist.push(movieId);
    await user.save();
    res.json(user.watchlist);
});

app.delete('/api/users/:id/watchlist/:movieId', async (req, res) => {
    const user = await User.findById(req.params.id);
    user.watchlist = user.watchlist.filter(m => m.toString() !== req.params.movieId);
    await user.save();
    res.json(user.watchlist);
});

// Diary
app.get('/api/users/:id/diary', async (req, res) => {
    const diaryEntries = await Diary.find({ userId: req.params.id }).sort({ watchedDate: -1 });
    res.json(diaryEntries);
});

app.post('/api/users/:id/diary', async (req, res) => {
    const entry = new Diary({
        userId: req.params.id,
        movieId: req.body.movieId,
        watchedDate: req.body.watchedDate,
        rating: req.body.rating,
        reviewText: req.body.reviewText,
    });
    await entry.save();
    res.status(201).json(entry);
});

/* ===========================================================
   Error Handling Middleware
   =========================================================== */
app.use((err, req, res, next) => {
    console.error("❌ Error:", err);
    res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

/* ===========================================================
   Start Server
   =========================================================== */
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
