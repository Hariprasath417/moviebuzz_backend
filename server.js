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
const MONGO_URI = process.env.REACT_APP_MONGO_URI;
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB connected successfully!"))
    .catch(err => console.error("MongoDB connection error:", err));

// --- Mongoose Schemas & Models ---

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    username: { type: String, required: true, unique: true }
});
const User = mongoose.model('User', userSchema);

const reviewSchema = new mongoose.Schema({
    movieId: { type: String, required: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    rating: { type: Number, required: true },
    text: { type: String },
    createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.model('Review', reviewSchema);

const userInteractionSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    likes: { type: [String], default: [] },
    watchlist: { type: [String], default: [] }
});
const UserInteraction = mongoose.model('UserInteraction', userInteractionSchema);

const diarySchema = new mongoose.Schema({
    userId: { type: String, required: true },
    movieId: { type: String, required: true },
    watchedDate: { type: Date, required: true },
    rating: { type: Number },
    reviewText: { type: String },
});
const Diary = mongoose.model('Diary', diarySchema);


// --- API Routes ---

// -- Auth Routes --
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

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(400).json({ message: "Invalid credentials." });
        }
        const token = jwt.sign({ email: user.email, id: user._id }, 'secret_key', { expiresIn: '1h' });
        res.status(200).json({ result: { id: user._id, email: user.email }, token });
    } catch (error) {
        res.status(500).json({ message: "Something went wrong." });
    }
});


// -- Review Routes --
app.get('/api/reviews/:movieId', async (req, res) => {
    try {
        const reviews = await Review.find({ movieId: req.params.movieId }).sort({ createdAt: -1 });
        res.json(reviews);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ** NEW ROUTE ADDED HERE **
app.get('/api/user/:userId/reviews', async (req, res) => {
    try {
        const reviews = await Review.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(reviews);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


app.post('/api/reviews', async (req, res) => {
    const review = new Review({
        movieId: req.body.movieId,
        userId: req.body.userId,
        username: req.body.username,
        rating: req.body.rating,
        text: req.body.text
    });
    try {
        const newReview = await review.save();
        res.status(201).json(newReview);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// -- User Interaction Routes --
app.get('/api/user/:userId/interactions', async (req, res) => {
    try {
        let interactions = await UserInteraction.findOne({ userId: req.params.userId });
        if (!interactions) {
            interactions = new UserInteraction({ userId: req.params.userId });
            await interactions.save();
        }
        res.json(interactions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/user/:userId/watchlist/toggle', async (req, res) => {
    const { movieId } = req.body;
    const { userId } = req.params;
    try {
        const interactions = await UserInteraction.findOne({ userId });
        const movieIndex = interactions.watchlist.indexOf(movieId);
        if (movieIndex > -1) {
            interactions.watchlist.splice(movieIndex, 1);
        } else {
            interactions.watchlist.push(movieId);
        }
        await interactions.save();
        res.json(interactions);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.post('/api/user/:userId/likes/toggle', async (req, res) => {
    const { movieId } = req.body;
    const { userId } = req.params;
    try {
        const interactions = await UserInteraction.findOne({ userId });
        const movieIndex = interactions.likes.indexOf(movieId);
        if (movieIndex > -1) {
            interactions.likes.splice(movieIndex, 1);
        } else {
            interactions.likes.push(movieId);
        }
        await interactions.save();
        res.json(interactions);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// -- Diary Routes --
app.get('/api/user/:userId/diary', async (req, res) => {
    try {
        const diaryEntries = await Diary.find({ userId: req.params.userId }).sort({ watchedDate: -1 });
        res.json(diaryEntries);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/user/:userId/diary', async (req, res) => {
    const entry = new Diary({
        userId: req.params.userId,
        movieId: req.body.movieId,
        watchedDate: req.body.watchedDate,
        rating: req.body.rating,
        reviewText: req.body.reviewText,
    });
    try {
        const newEntry = await entry.save();
        res.status(201).json(newEntry);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});


// --- Start Server ---
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));