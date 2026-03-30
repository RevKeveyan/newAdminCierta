const mongoose = require("mongoose");
const addressSchema = require("./subModels/Address");
const carrierPeopleSchema = require("./subModels/CarrierPeople");
const { getCurrentDateUTC5 } = require("../utils/dateUtils");

const carrierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  // People associated with this carrier (drivers/dispatchers)
  people: [{
    type: carrierPeopleSchema
  }],
  phoneNumber: {
    type: String
  },
  email: {
    type: String,
    lowercase: true,
    sparse: true // Allows multiple null/undefined values
  },
  companyName: {
    type: String,
    sparse: true // Allows multiple null/undefined values
  },
  dba: {
    type: String,
    trim: true
  },
  mcNumber: {
    type: String,
    sparse: true // Allows multiple null/undefined values
  },
  dotNumber: {
    type: String,
    sparse: true // Allows multiple null/undefined values
  },
  address: {
    type: addressSchema
  },
  photos: [String],
  // Информация об оборудовании и возможностях
  equipment: [{
    type: {
      type: String,
      required: true
    },
    sizes: [{
      type: String
    }]
  }],
  equipmentType: {
    type: [String],
    required: true,
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length > 0 && v.every(type => type && type.trim() !== '');
      },
      message: 'At least one Equipment Type is required'
    }
  },
  size: {
    type: [String],
    validate: {
      validator: function(v) {
        return !v || Array.isArray(v);
      },
      message: 'Size must be an array'
    }
  },
  capabilities: [{
    type: String
  }],
  certifications: [{
    type: String
  }],
  
  // Банковские реквизиты для выплат
  routing: {
    type: String,
    trim: true
  },
  bankAccount: {
    type: String,
    trim: true
  },
  accountNumber: {
    type: String,
    trim: true
  },
  
  // Files organized by type
  images: [String],  // Array of image URLs
  pdfs: [String],    // Array of PDF URLs
  
  // Legacy field for backward compatibility
  file: {
    type: String
  },
  
  // Связь с Loads
  loads: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Load'
  }],
  
  // Status
  status: {
    type: String,
    enum: ["active", "suspended", "inactive"],
    default: "active",
    required: true
  }
}, { timestamps: true, versionKey: false });

// Pre-save hook to set dates in UTC-5 and remove undefined/null values
carrierSchema.pre('save', function(next) {
  const now = getCurrentDateUTC5();
  if (this.isNew) {
    this.createdAt = now;
  }
  this.updatedAt = now;
  
  const doc = this.toObject();
  for (const key in doc) {
    if (doc.hasOwnProperty(key) && key !== '_id' && key !== '__v' && key !== 'createdAt' && key !== 'updatedAt') {
      if (doc[key] === undefined || doc[key] === null) {
        this.set(key, undefined);
      } else if (doc[key] === 'undefined' || doc[key] === 'null' || doc[key] === '') {
        this.set(key, undefined);
      }
    }
  }
  
  if (this.people && Array.isArray(this.people)) {
    this.people = this.people.filter(person => 
      person && typeof person === 'object'
    );
  }
  
  if (this.emails !== undefined) {
    this.set('emails', undefined);
  }
  
  next();
});

carrierSchema.index({ name: 1 });
carrierSchema.index({ mcNumber: 1 }, { unique: true, sparse: true });
carrierSchema.index({ dotNumber: 1 }, { unique: true, sparse: true });
carrierSchema.index({ email: 1 }, { unique: true, sparse: true });
carrierSchema.index({ companyName: 1 }, { sparse: true });
carrierSchema.index({ status: 1 });
carrierSchema.index({ createdAt: -1 });
carrierSchema.index({ updatedAt: -1 });
carrierSchema.index({ status: 1, createdAt: -1 }); 

module.exports = mongoose.model("Carrier", carrierSchema);




