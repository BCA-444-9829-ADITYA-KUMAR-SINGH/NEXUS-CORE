const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    // Links the chat to a specific user
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    // The actual conversation array
    messages: [{
        role: { type: String, enum: ['user', 'ai'] },
        content: { type: String },
        timestamp: { type: Date, default: Date.now }
    }],
    // Metadata for your Admin Page
    stats: {
        questionCount: { type: Number, default: 0 },
        lastActive: { type: Date, default: Date.now }
    }
}, { timestamps: true }); // Automatically adds createdAt and updatedAt

module.exports = mongoose.model('Chat', ChatSchema);