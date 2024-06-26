import User from '../models/User.mjs';
import Contact from '../models/Contact.mjs';
import validator from 'validator';
import asyncHandler from 'express-async-handler';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import zxcvbn from 'zxcvbn';
import crypto from 'crypto';
import { sendWelcomeEmail, sendResetPasswordEmail, sendConfirmationCode, sendDeactivationEmail } from '../services/emailService.mjs';
import upload from '../middlewares/fileUpload.mjs';

// @desc    Get all  users

export const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find();
  return users ? res.status(200).json(users) : res.status(404).json({ message: 'No Users Found' });
});

// desc get a user by id

export const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  return user ? res.status(200).json(user) : res.status(404).json({ message: 'User not found' });
});


export const registerUser = asyncHandler(async (req, res) => {
    try {
    const { name, email, password } = req.body;

    
    if (!name || name.trim().length < 3) {
      return res.status(400).json({ message: '3 chrachters long Name is required !' });
    }
    
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: 'Invalid email adress' });
    }
    
    const passwordStrength = zxcvbn(password);
    if (passwordStrength.score < 0.5) {
      throw new Error(`Password is too weak. ${passwordStrength.feedback.warning}`);
    }
    
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' })};
      

      const salt = await bcrypt.genSalt(3);
      const hashedPassword = await bcrypt.hash(password, salt);
      const code = crypto.randomInt(100000, 999999).toString();

      const user = await User.create({
        name,
        email,
        password: hashedPassword,
        isActive: false,
        code
      });

      await sendConfirmationCode(email, code);

      const token = jwt.sign({
        userId: user._id,
        userRole: user.role 
      }, process.env.JWT_SECRET, { expiresIn: '1d' });
      
      res.set('Authorization', `Bearer ${token}`);
      res.status(201).json({message:'User created successfully , Please check your email for confirmation ',user:user,token:token});
} catch (error) {
    res.status(500).json({ message: 'Error while registering user :(', error: error.message });

}});


// desc login user 

export const loginUser = asyncHandler(async (req, res) => {
    try 
    {
        const { email, password , rememberMe } = req.body;
        if (!validator.isEmail(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }
        if (!password || !email) {
            return res.status(400).json({ message: 'all inputs are required !' });
        }
        
        const user = await User.findOne({ email});
        if (!user) { return res.status(404).json({ message: 'User not found' }); }

        if (!user.isActive) {
          return res.status(401).json({ message: 'User account is still deactivated ' });

        }

        if (user.loginAttempts >= 5 && user.lastFailedLoginTime > Date.now() - 30 * 60000) {
          return res.status(401).json({ message: 'User account is locked !' });
        }

        const PasswordMatch = await bcrypt.compare(password, user.password);
        if (!PasswordMatch) { 
          user.loginAttempts += 1; // Increment login attempts
          user.lastFailedLoginTime = Date.now();

          await user.save();
          return res.status(401).json({ message: 'Invalid Credentiels' }); }  


          
          user.loginAttempts = 0; // Reset login attempts
          user.lastFailedLoginTime = null; 

        await user.save();
        const expiresIn = rememberMe ? '30d' : '1d'  
        const token = jwt.sign({
          userId: user._id,
          userRole: user.role,
      }, process.env.JWT_SECRET, { expiresIn });

        res.set('Authorization', `Bearer ${token}`);
        res.cookie('token', token, { httpOnly: true, maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 2 * 24 * 60 * 60 * 1000 }); 
        res.status(200).json({ message: 'User logged in successfully', token });
    }
    catch  (error)
    {   
        res.status(500).json({ message: 'Error while logging in :(', error: error.message });
    }
});

// @desc : in this function you gotta use the password whenever you make the change (security measure)
export const updateUser = asyncHandler(async (req, res) => {
    try {
      const userId = req.params.id;
      const updates = req.body;
  
      let user = await User.findById(userId);
  
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      const passwordMatch = await bcrypt.compare(updates.password, user.password);
  
      if (!passwordMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
  
      if (updates.password) {
        updates.password = await bcrypt.hash(updates.password, 12);
      }
  
      user = await User.findByIdAndUpdate(userId, updates, {
        new: true,
        runValidators: true,
      });
  
      res.status(200).json({ message: 'Profile updated successfully', user });
    } catch (err) {
      console.error('Error updating user profile:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });



export const deleteUser = asyncHandler(async (req, res) => {
    const userId = req.params.id;
  
    try {
      const user = await User.findByIdAndDelete(userId);
  
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Unauthorized: Invalid token' });
      }
      res.status(500).json({ message: 'Internal server error' });
    }
});

// export function generateAccessToken(username) {
//   return jwt.sign(username, process.env.TOKEN_SECRET, { expiresIn: '10000000s' });
// }


// desc : logout a user 
export const logoutUser = async (req, res) => {
  res.clearCookie('token');
  res.status(200).json({ message: 'Logged out successfully' });
};

export const resetPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).json({ message: 'Email not found' });
  }

  const otp = crypto.randomInt(100000, 999999).toString();

  user.resetPasswordOTP = otp;
  user.resetPasswordOTPExpires = Date.now() + 3600000000; 
  await user.save({ force: true });

  // Send the OTP email
  await sendResetPasswordEmail(email, otp);

  res.status(200).json({ message: 'Password reset OTP sent to your email' });
});


// desc : this route verify otp ( for dev only )  

export const verifyResetPasswordOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).json({ message: 'Email not found' });
  }

  if (user.resetPasswordOTP === otp ) {
    res.status(200).json({ message: 'OTP verified successfully' });
  } else {
    res.status(400).json({ message: 'Invalid or expired OTP' });
  }
});

//desc: update the password of the user 
export const updatePasswordWithOTP = asyncHandler(async (req, res) => {
  const { email, newPassword , otp } = req.body;

  // Find the user with the provided email
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).json({ message: 'Email not found' });
  }



  // Update the user's password
  if (user.resetPasswordOTP != otp ) {
    return res.status(401).json({message: "invalid otp :( "})
  }
  
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  user.password = hashedPassword;
  user.resetPasswordOTP = undefined;
  user.resetPasswordOTPExpires = undefined;
  await user.save();


  res.status(200).json({ message: 'Password updated successfully' });

}
  ); 

//desc: desactivating a user profile 

export const desactivateUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const passwordMatch = await bcrypt.compare(req.body.password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }
    sendDeactivationEmail(user.name , user.email)
    user.isActive = false;
    await user.save();
    res.status(200).json({ message: 'User deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});


const resendConfirmationCode = async (email, code) => {
  try {
    await sendConfirmationCode(email, code);
  } catch (error) {
    throw new Error(`Failed to resend confirmation code email: ${error}`);
  }
};


//@desc activate a user account when he register 

export const activateUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  let {code,resend} = req.body
  resend = resend || false;
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (resend) {
      await resendConfirmationCode(user.email, user.code);
      return res.status(200).json({ message: 'Confirmation code resent successfully' });
    }
    if (code == user.code) {
      user.isActive = true;
      user.code = undefined;
      await user.save();
      sendWelcomeEmail(user.name , user.email)
      res.status(200).json({ message: 'User activated successfully' });
    }
    else {
      res.status(400).json({ message: 'Invalid confirmation code' });
    }
  }
  catch(error)
  {
    res.status(500).json({ message: 'Error while activating user', error: error.message });
  }});


  export const updateProfilePicture = asyncHandler(async (req, res) => {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    upload.single('profilePicture')(req, res, async (err) => {
      if (err) return res.status(400).json({ message: 'Error uploading profile picture' });
      if (req.file) {
        user.profilePicture = `http://uventlo.icu/${req.file.filename}`;
        await user.save();
        res.status(200).json({ message: 'Profile picture updated successfully', profilePicture: user.profilePicture });
      } else {
        res.status(400).json({ message: 'No file uploaded' });
      }
    });
  });




  export const addContact = async (req, res) => {
    try {
        console.log("id",req.params.id)
        const user = await User.findById(req.params.id)
        console.log(user)
        const userContact = await User.findById(req.body.contactId)
        const existingContact = await Contact.findOne({ user: user._id, contact: userContact._id })
        if (existingContact) {
            return res.status(400).json({ message: 'Contact already exists' })
        }
        const contact = await Contact.create({ user: user._id, contact: userContact._id })
        user.contacts.push(contact._id)
        const contact2 = await Contact.create({ user: userContact._id, contact: user._id })
        userContact.contacts.push(contact2._id)
        await user.save()
        await userContact.save()
        res.status(201).json({ message: 'Contact added successfully', contact })
    } catch (error) {
        console.log("can't add contact")
        res.status(500).json(error)
    }
}


export const getContacts = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }
        const contacts = await Contact.find({ user: user._id }).populate('contact');
        res.status(200).json(contacts)
    } catch (error) {
        res.status(500).json(error)
    }
}

export const getContact = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).populate('contacts');
        let userContact = user.contacts.map(contact => contact.populate('contact'))
        console.log("contact dasdasdas ddsa", userContact)
        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }
        const contact = userContact.find(contact => contact.contact._id == req.params.contactId)
        if(!contact){
            return res.status(404).json({ message: 'Contact not found' })
        }

        res.status(200).json(contact)
    } catch (error) {
        res.status(500).json(error)
    }
}