const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User'
        },
        club: {
            type: String,
            required: [true, 'Please select a club'],
            enum: ['Chelsea', 'Barcelona', 'Manchester City', 'Juventus', 'Paris Saint-Germain - PSG',
                'Liverpool FC', 'AC Milan', 'Bayern Munich', 'Manchester United'
            ],
            trim: true // remove extra spaces
        },
        description: {
            type: String,
            required: [true, 'Please describe the issue'],
            trim: true, // removes leading/trailing spaces
            minlength: [10, 'Description should be at least 10 characters'] // optional
        },
        status: {
            type: String,
            enum: ['new', 'open', 'closed'],
            default: 'new',
            lowercase: true // ensures consistency
        }
    },
    {
        timestamps: true
    }
);

// Optional: create an index for faster queries by user and status
FeedbackSchema.index({ user: 1, status: 1 });

const Feedbacks = mongoose.model('Feedback', FeedbackSchema);

module.exports = Feedbacks;
