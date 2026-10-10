const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true
	},
	phone: {
		type: String,
		required: true
	},
	stbNumber: {
		type: String,
		required: true,
		unique: true
	},
	plan: {
		type: String,
		required: true
	},
	amount: {
		type: Number,
		required: true
	},
	rechargeDate: {
		type: Date,
		required: true
	},
	expiryDate: {
		type: Date,
		required: true
	},
	notificationStatus: {
		threeDay: {
			type: Boolean,
			default: false
		},
		twoDay: {
			type: Boolean,
			default: false
		},
		oneDay: {
			type: Boolean,
			default: false
		}
	}
});

module.exports = mongoose.model("Customer", customerSchema);
