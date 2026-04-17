/* ================================================================
   NEXUS CORE: AI PLATFORM BACKEND (Node.js & Express)
   Built for: Content Writing, Code Assistance, & Study Guides
================================================================
*/

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); 
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const Contact = require('./models/contact');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

/* --- ZONE 1: MIDDLEWARE --- */
app.use(cors({
    origin: "*", 
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
})); 
app.use(express.json()); 
app.use(express.static(path.join(__dirname, '/frontend'))); 

/* --- ZONE 2: DATABASE CONNECTION --- */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Nexus Core: Connected to MongoDB"))
  .catch(err => console.error("❌ Database Connection Error:", err));

/* --- ZONE 3: DATA MODELS --- */

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  role: { type: String, default: "user" }, 
  email: { type: String, unique: true, required: true },
  mobile: { type: String },
  gender: { type: String, required: true },
  profession: { type: String, required: true },
  password: { type: String, required: true },
  lastLogin: { type: Date, default: Date.now },
  lastLogout: { type: Date }
});

const chatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toolUsed: { type: String, default: "General Chat" }, 
  messages: [{ 
    role: { type: String, enum: ['user', 'ai'] },
    content: String,
    timestamp: { type: Date, default: Date.now }
  }],
  stats: {
    questionCount: { type: Number, default: 0 },
    wordCount: { type: Number, default: 0 }, // Tracks total words processed
    lastActive: { type: Date, default: Date.now }
  }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Chat = mongoose.models.Chat || mongoose.model('Chat', chatSchema);

/* --- ZONE 4: SECURITY --- */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 
  
  if (!token) return res.status(401).json({ error: "Access Denied: No Token Found" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Security Alert: Invalid Token" });
    req.user = decoded; 
    next(); 
  });
}

/* --- ZONE 5: AI CONFIGURATION --- */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel(
    { model: "gemini-2.5-flash-lite" },
    { apiVersion: "v1" }
);

/* --- ZONE 6: API ROUTES --- */

// 1. LOGIN ROUTE
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const MASTER_EMAIL = "admin1@gmail.com";
        const MASTER_PASS = "admin1234567098";

        if (email === MASTER_EMAIL && password === MASTER_PASS) {
            const token = jwt.sign({ userId: "ADMIN_01", username: "Nexus Admin", role: "admin" }, process.env.JWT_SECRET, { expiresIn: '24h' });
            return res.json({ token, username: "Nexus Admin", role: "admin" });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: "Invalid Email" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: "Incorrect Password" });

        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign({ userId: user._id, username: user.username, role: "user" }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, username: user.username, role: "user" });
    } catch (err) {
        res.status(500).json({ error: "Login failed on server" });
    }
});

// 2. SIGNUP ROUTE
app.post('/api/signup', async (req, res) => {
  try {
    const { username, email, mobile, gender, profession, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, mobile, gender, profession, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'Welcome to Nexus!' });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Username or Email already exists." });
    res.status(500).json({ error: "Signup process failed" });
  }
});

// 3. MAIN AI ROUTE (Nexus Guard & Analytics Integration)
app.post("/api/ask", authenticateToken, async (req, res) => {
    const { prompt, chatId, toolType } = req.body; 
    const userId = req.user.userId;
    const isAdmin = req.user.role === 'admin';

    // --- NEXUS GUARD: PROMPT VALIDATION ---
    if (toolType === "Code Assistant") {
        const codeKeywords = ["code", "function", "var", "const", "{", "script", "debug", "api", "html", "css", "logic"];
        const isCodingQuery = codeKeywords.some(word => prompt.toLowerCase().includes(word));
        if (!isCodingQuery) {
            return res.status(400).json({ error: "Nexus Guard: This tool is restricted to Programming/Technical queries only." });
        }
    }

    if (toolType === "Content Writing" && prompt.length < 5) {
        return res.status(400).json({ error: "Nexus Guard: Request too short for quality content generation." });
    }

    try {
        const instructions = {
            "Code Assistant": "You are a Senior Software Engineer. Provide efficient code and fix bugs.",
            "Study Guide": "You are a PhD Tutor. Explain concepts clearly and use examples.",
            "Content Writing": "You are a Professional Copywriter. Write engaging and clean text."
        };

        const systemPrompt = instructions[toolType] || "You are a helpful Nexus AI assistant.";

        // CALL AI
        const result = await aiModel.generateContent(`${systemPrompt}\n\nUser Question: ${prompt}`);
        const aiReply = result.response.text();

        // ANALYTICS: Calculate Word Count
        const totalWords = (prompt.split(" ").length) + (aiReply.split(" ").length);

        let returnChatId = chatId;

        // DB LOGGING (Skip if Admin)
        if (!isAdmin) {
            const filter = chatId && mongoose.isValidObjectId(chatId) ? { _id: chatId } : { userId, "stats.questionCount": 0 };
            const update = {
                $push: { messages: [
                    { role: 'user', content: prompt, timestamp: new Date() }, 
                    { role: 'ai', content: aiReply, timestamp: new Date() }
                ]},
                $inc: { 
                    "stats.questionCount": 1,
                    "stats.wordCount": totalWords 
                },
                $set: { "stats.lastActive": Date.now(), toolUsed: toolType || "General Chat" }
            };

            const savedChat = await Chat.findOneAndUpdate(filter, update, { upsert: true, new: true });
            returnChatId = savedChat._id;
        }

        res.json({ reply: aiReply, chatId: returnChatId, text: aiReply }); 
    } catch (err) {
        console.error("Gemini Error:", err.message);
        res.status(500).json({ error: "The AI Core is offline. Please try again later." });
    }
});

// 4. ADMIN DATA ROUTE
app.get('/api/admin/all-data', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: "Restricted Area" });

        const users = await User.find({}, '-password');
        const chats = await Chat.find().populate('userId', 'username email');
        const contacts = await Contact.find().sort({ createdAt: -1 });

        const toolStats = { "Content": 0, "Code": 0, "Study": 0, "General": 0 };
        chats.forEach(c => {
            const tool = (c.toolUsed || "").toLowerCase();
            if (tool.includes("content")) toolStats["Content"]++;
            else if (tool.includes("code")) toolStats["Code"]++;
            else if (tool.includes("study")) toolStats["Study"]++;
            else toolStats["General"]++;
        });

        res.json({ users, logs: chats, toolStats, supportMessages: contacts });
    } catch (err) {
        res.status(500).json({ error: "Failed to retrieve admin data" });
    }
});
// 6. UPDATED USER PROFILE DATA ROUTE (For PDF Report)
app.get('/api/user/report', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const userEmail = req.user.email; // Extracted from JWT

        // Fetch user details
        const user = await User.findById(userId).select('-password');
        
        // Fetch chat logs
        const chats = await Chat.find({ userId }).sort({ updatedAt: -1 });

        // Fetch contact/complaint messages based on email
        const complaints = await Contact.find({ email: user.email }).sort({ createdAt: -1 });

        if (!user) return res.status(404).json({ error: "User not found" });

        res.json({
            profile: user,
            history: chats,
            complaints: complaints // Added this to the response
        });
    } catch (err) {
        console.error("Report Fetch Error:", err);
        res.status(500).json({ error: "Failed to compile report data" });
    }
});

// 5. CONTACT FORM ROUTE
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        const newContact = new Contact({ name, email, subject, message });
        await newContact.save();
        res.status(201).json({ message: "Message Sent Successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to send message" });
    }
});

/* --- ZONE 7: SERVER START --- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Nexus Server Online on Port ${PORT}`));