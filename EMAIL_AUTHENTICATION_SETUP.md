# Email Authentication Setup Guide

This guide covers the new email-based authentication features that have been implemented for FetchNews.

## 🎯 Features Implemented

### 1. Email Validation During Signup
- **Email format validation**: Ensures users enter a valid email address
- **Disposable email detection**: Blocks common disposable/temporary email providers
- Prevents fake accounts and improves user quality

### 2. Email Verification
- Users receive a verification email upon signup
- Email must be verified before full account access (optional enforcement)
- Verification links expire after 24 hours
- Users can resend verification emails if needed

### 3. Password Reset via Email
- Users can request password reset from the "Forgot Password" screen
- Reset email contains a secure, time-limited link (10 minutes)
- Prevents email enumeration attacks
- Secure token-based verification

## 📧 Email Service Configuration

### Required Environment Variables

Add these to your `.env` file (see `env.example` for reference):

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-specific-password
```

### Setting Up Gmail SMTP

If you're using Gmail (recommended for development):

1. **Enable 2-Factor Authentication** on your Google account
2. **Generate an App Password**:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Name it "FetchNews Backend"
   - Copy the 16-character password
3. **Add to your `.env` file**:
   ```env
   SMTP_USER=your.email@gmail.com
   SMTP_PASSWORD=abcd efgh ijkl mnop
   ```

### Other Email Providers

#### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
```

#### Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASSWORD=your-mailgun-password
```

#### AWS SES
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-aws-access-key
SMTP_PASSWORD=your-aws-secret-key
```

## 🔌 API Endpoints

### 1. Register (Updated)
```
POST /api/auth/register
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "User created successfully. Please check your email to verify your account.",
  "token": "jwt-token",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "emailVerified": false,
    "isPremium": false,
    ...
  }
}
```

**Validation Rules:**
- Email must be valid format
- Email cannot be from disposable provider
- Password must be at least 6 characters

### 2. Verify Email
```
GET /api/auth/verify-email?token=verification-token
```

**Response:**
```json
{
  "message": "Email verified successfully",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "emailVerified": true
  }
}
```

### 3. Resend Verification Email
```
POST /api/auth/resend-verification
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Verification email sent successfully"
}
```

### 4. Forgot Password (Updated)
```
POST /api/auth/forgot-password
```

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

### 5. Reset Password
```
POST /api/auth/reset-password
```

**Request:**
```json
{
  "token": "reset-token",
  "newPassword": "newpassword123"
}
```

**Response:**
```json
{
  "message": "Password has been reset successfully"
}
```

## 🗄️ Database Changes

### User Model Updates

New fields added to the User schema:

```javascript
{
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  }
}
```

### New Methods

- `user.generateEmailVerificationToken()` - Creates verification token
- `user.verifyEmail()` - Marks email as verified
- `user.generatePasswordResetToken()` - Creates password reset token (already existed)
- `user.clearPasswordResetToken()` - Clears reset token (already existed)

## 📱 Frontend Integration

### 1. Update Registration Flow

```swift
// After successful registration
if let message = response.message {
    // Show message to user: "Please check your email to verify your account."
}

// Store emailVerified status
user.emailVerified = response.user.emailVerified
```

### 2. Add Email Verification Screen

Create a view that:
- Checks if user's email is verified
- Shows prompt to verify email if not verified
- Provides "Resend Verification Email" button
- Handles verification token from deep link

### 3. Add Deep Link Handling

Handle verification links in your app:

```swift
// In your App or SceneDelegate
func handleURL(_ url: URL) {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
        return
    }
    
    if components.path == "/verify-email",
       let token = components.queryItems?.first(where: { $0.name == "token" })?.value {
        verifyEmail(token: token)
    }
    
    if components.path == "/reset-password",
       let token = components.queryItems?.first(where: { $0.name == "token" })?.value {
        // Navigate to reset password screen
    }
}
```

### 4. Update Forgot Password Flow

```swift
// Add "Forgot Password?" button on login screen
// On tap, navigate to ForgotPasswordView
// User enters email, receives reset link via email
// User clicks link, navigates to ResetPasswordView
// User enters new password
```

## 🎨 Email Templates

The email service includes beautifully designed HTML email templates for:

1. **Email Verification Email**
   - Welcoming message
   - Clear call-to-action button
   - 24-hour expiration notice

2. **Password Reset Email**
   - Security-focused messaging
   - Prominent reset button
   - 10-minute expiration notice
   - Reassurance if they didn't request it

Both templates are:
- Mobile-responsive
- Professional looking with gradient headers
- Include both HTML and plain-text versions
- Brand-consistent with FetchNews styling

## 🧪 Testing

### Test Email Verification

1. Register a new user
2. Check email inbox for verification email
3. Click verification link
4. Verify `emailVerified` becomes `true`

### Test Password Reset

1. Click "Forgot Password" on login screen
2. Enter email address
3. Check email inbox for reset link
4. Click link and enter new password
5. Verify you can login with new password

### Test Email Validation

Try registering with:
- Invalid email format: `notanemail`
- Disposable email: `test@tempmail.com`
- Should receive appropriate error messages

## 🔒 Security Features

1. **Token Security**
   - All tokens are hashed using SHA-256 before storage
   - Original tokens never stored in database
   - Tokens have expiration times

2. **Email Enumeration Prevention**
   - Password reset always returns success message
   - Actual email only sent if account exists
   - Prevents attackers from discovering valid accounts

3. **Disposable Email Blocking**
   - Blocks 15+ common disposable email providers
   - Easy to expand list as needed

4. **Rate Limiting** (Recommended)
   - Add rate limiting to email endpoints
   - Prevent email bombing/spam attacks

## 📝 Production Checklist

Before going live:

- [ ] Configure production SMTP credentials
- [ ] Set `FRONTEND_ORIGIN` to production URL
- [ ] Test all email flows in production
- [ ] Add rate limiting to email endpoints
- [ ] Monitor email delivery rates
- [ ] Set up email bounce handling
- [ ] Consider using dedicated email service (SendGrid, etc.)
- [ ] Update disposable email list if needed
- [ ] Test email deliverability (check spam folders)
- [ ] Ensure SMTP credentials are in `.env`, not `.env.example`

## 🚀 Deployment Notes

### Environment Variables

Make sure to set these in your hosting platform:
- Render.com: Dashboard → Environment → Environment Variables
- Heroku: `heroku config:set SMTP_USER=your@email.com`
- Railway: Settings → Variables

### Email Deliverability

For production, consider:
1. **Dedicated Email Service**: SendGrid, Mailgun, AWS SES
2. **Domain Verification**: Verify your sending domain
3. **SPF/DKIM Records**: Set up proper DNS records
4. **Monitor Bounce Rates**: Track email delivery success

## 🐛 Troubleshooting

### Emails Not Sending

1. Check SMTP credentials are correct
2. Verify firewall allows outbound port 587
3. Check spam folder
4. Look at server logs for error messages
5. Test SMTP connection:
   ```javascript
   const transporter = require('./utils/emailService');
   transporter.verify((error, success) => {
     if (error) console.log(error);
     else console.log('Server is ready to send emails');
   });
   ```

### Gmail Errors

- "Username and Password not accepted": Use App Password, not regular password
- "Less secure app access": Enable 2FA and use App Password
- Daily limit reached: Gmail has sending limits (100-500/day)

### Verification Links Not Working

1. Check `FRONTEND_ORIGIN` is set correctly
2. Verify deep link handling is implemented
3. Check token hasn't expired
4. Look for token in database (should be hashed)

## 📚 Additional Resources

- [Nodemailer Documentation](https://nodemailer.com/about/)
- [Gmail SMTP Setup](https://support.google.com/mail/answer/7126229)
- [SendGrid SMTP Guide](https://docs.sendgrid.com/for-developers/sending-email/integrating-with-the-smtp-api)
- [Email Template Best Practices](https://www.campaignmonitor.com/resources/guides/email-design/)

## 🤝 Support

If you encounter issues:
1. Check server logs for error messages
2. Verify environment variables are set
3. Test SMTP connection
4. Review this guide
5. Check email provider documentation

