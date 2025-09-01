require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

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

// --- Schemas & Models ---
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

// --- TMDB Helpers ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// --- Auth Routes ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "User already exists." });

        const hashedPassword = await bcrypt.hash(password, 12);
        const username = email.split('@')[0];
        const newUser = new User({ email, password: hashedPassword, username });
        await newUser.save();
        res.status(201).json({ message: "User created successfully!" });
    } catch (err) {
        res.status(500).json({ message: "Something went wrong." });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found." });

        if (!user) return res.status(404).json({ message: "User not found." });

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) return res.status(400).json({ message: "Invalid credentials." });

        const token = jwt.sign({ email: user.email, id: user._id }, 'secret_key', { expiresIn: '1h' });
        res.status(200).json({ result: { id: user._id, email: user.email }, token });
    } catch (err) {
        res.status(500).json({ message: "Something went wrong." });
    }
});

// --- Review Routes ---
app.get('/api/reviews/:movieId', async (req, res) => {
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

app.get('/api/users/:userId/reviews', async (req, res) => {
    try {
        const reviews = await Review.find({ userId: req.params.userId }).sort({ createdAt: -1 });

        const reviewsWithMovies = await Promise.all(reviews.map(async (review) => {
            try {
                const response = await axios.get(`${TMDB_BASE_URL}/movie/${review.movieId}`, {
                    params: { api_key: TMDB_API_KEY }
                });
                const movie = response.data;
                return { ...review.toObject(), movie: { id: movie.id, title: movie.title, poster_path: movie.poster_path, release_date: movie.release_date } };
            } catch {
                return { ...review.toObject(), movie: { id: review.movieId, title: "Unknown", poster_path: null, release_date: null } };
            }
        }));

        res.json(reviewsWithMovies);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/reviews', async (req, res) => {
    try {
        const review = new Review(req.body);
        const newReview = await review.save();
        res.status(201).json(newReview);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- User Interaction Routes ---
app.get('/api/users/:userId/interactions', async (req, res) => {
    try {
        let interactions = await UserInteraction.findOne({ userId: req.params.userId });
        if (!interactions) {
            interactions = new UserInteraction({ userId: req.params.userId, likes: [], watchlist: [] });
            await interactions.save();
        }
        res.json({
            likes: interactions.likes || [],
            watchlist: interactions.watchlist || []
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/users/:userId/watchlist/toggle', async (req, res) => {
    try {
        const { movieId } = req.body;
        const { userId } = req.params;
        let interactions = await UserInteraction.findOne({ userId });
        if (!interactions) interactions = new UserInteraction({ userId, likes: [], watchlist: [] });

        const index = interactions.watchlist.indexOf(movieId);
        if (index > -1) interactions.watchlist.splice(index, 1);
        else interactions.watchlist.push(movieId);

        await interactions.save();
        res.json({ watchlist: interactions.watchlist });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.post('/api/users/:userId/likes/toggle', async (req, res) => {
    try {
        const { movieId } = req.body;
        const { userId } = req.params;
        let interactions = await UserInteraction.findOne({ userId });
        if (!interactions) interactions = new UserInteraction({ userId, likes: [], watchlist: [] });

        const index = interactions.likes.indexOf(movieId);
        if (index > -1) interactions.likes.splice(index, 1);
        else interactions.likes.push(movieId);

        await interactions.save();
        res.json({ likes: interactions.likes });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- Diary Routes ---
app.get('/api/users/:userId/diary', async (req, res) => {
    try {
        const diaryEntries = await Diary.find({ userId: req.params.userId }).sort({ watchedDate: -1 });
        res.json(diaryEntries);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/users/:userId/diary', async (req, res) => {
    try {
        const entry = new Diary(req.body);
        const newEntry = await entry.save();
        res.status(201).json(newEntry);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- User Profile Routes ---
app.get('/api/users/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: "User not found." });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/users/:userId', async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(req.params.userId, req.body, { new: true });
        res.json(updatedUser);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- Start Server ---
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
