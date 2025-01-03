const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const TruckDriver = require('../models/TruckDriver');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

// @route   POST api/truckDriver/register
// @desc    Register a new truck driver
// @access  Public
router.post(
    '/register',
    [
        check('name', 'Name is required').not().isEmpty(),
        check('mobileNumber', 'Please include a valid mobile number').isMobilePhone(),
        check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
        check('truckCapacity', 'Truck capacity is required').isNumeric(),
        // licensePlateNumber is optional
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { name, mobileNumber, password, truckCapacity, licensePlateNumber } = req.body;

        try {
            // Check if user already exists
            let driver = await TruckDriver.findOne({ mobileNumber });
            if (driver) {
                return res.status(400).json({ errors: [{ msg: 'User already exists' }] });
            }
            // If licensePlateNumber is provided, verify it
            if (licensePlateNumber) {
                // Prepare the API request
                // const authToken = Buffer.from(process.env.ATTESTR_AUTH_TOKEN).toString('base64');
                const options = {
                method: 'POST',
                url: 'https://api.attestr.com/api/v2/public/checkx/rc',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${process.env.ATTESTR_AUTH_TOKEN}`,
                },
                data: {
                    reg: licensePlateNumber,
                },
                };

                // Make the API call
                const response = await axios.request(options);

                // Check the response
                if (response.status === 200 && response.data) {
                // License plate is valid
                // Optionally, you can store the vehicle details from response.data
                } else {
                return res.status(400).json({ errors: [{ msg: 'Invalid license plate number' }] });
                }
            }
            driver = new TruckDriver({
                name,
                mobileNumber,
                password,
                truckCapacity,
                licensePlateNumber,
            });

            // Hash the password
            const salt = await bcrypt.genSalt(10);
            driver.password = await bcrypt.hash(password, salt);

            await driver.save();

            // Return JWT
            const payload = {
                user: {
                    id: driver.id,
                    role: 'truckDriver',
                },
            };

            jwt.sign(
                payload,
                process.env.JWT_SECRET,
                { expiresIn: '1h' },
                (err, token) => {
                    if (err) throw err;
                    res.json({ token });
                }
            );
        } catch (err) {
            console.error('Error message:', err.message);
      
            if (err.response) {
              console.error('Status:', err.response.status);
              console.error('Data:', err.response.data);
      
              // Return detailed error to client
              return res.status(err.response.status).json({
                errors: [
                  {
                    msg: err.response.data.message || 'License plate verification failed',
                    code: err.response.data.code,
                    details: err.response.data,
                  },
                ],
              });
            } else if (err.request) {
              console.error('No response received:', err.request);
      
              return res.status(500).json({
                errors: [
                  {
                    msg: 'No response from license plate verification service',
                  },
                ],
              });
            } else {
              console.error('Error:', err.message);
      
              return res.status(500).json({
                errors: [
                  {
                    msg: 'Server error',
                  },
                ],
              });
            }
        }
    }
);

// @route   POST api/truckDriver/login
// @desc    Authenticate truck driver & get token
// @access  Public
router.post(
    '/login',
    [
        check('mobileNumber', 'Please include a valid mobile number').isMobilePhone(),
        check('password', 'Password is required').exists(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { mobileNumber, password } = req.body;

        try {
            // Check if user exists
            let driver = await TruckDriver.findOne({ mobileNumber });
            if (!driver) {
                return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
            }

            // Compare passwords
            const isMatch = await bcrypt.compare(password, driver.password);
            if (!isMatch) {
                return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
            }

            // Return JWT
            const payload = {
                user: {
                    id: driver.id,
                    role: 'truckDriver',
                },
            };

            jwt.sign(
                payload,
                process.env.JWT_SECRET,
                { expiresIn: '1h' },
                (err, token) => {
                    if (err) throw err;
                    res.json({ token });
                }
            );
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Server error');
        }
    }
);
const auth = require('../middleware/auth');

// @route   GET api/truckDriver/profile
// @desc    Get logged-in truck driver's profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
    try {
        const driver = await TruckDriver.findById(req.user.id).select('-password');
        res.json(driver);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

module.exports = router;
