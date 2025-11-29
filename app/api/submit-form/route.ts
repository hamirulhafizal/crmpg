import { NextResponse } from 'next/server';
import { getDealerInfo } from '../../lib/data';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const formData = await req.json();
    const toEmail = formData.dealerEmail;

    // Configure nodemailer with Gmail SMTP
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER, // Set in .env.local
        pass: process.env.GMAIL_PASS, // Set in .env.local (App Password)
      },
    });

    // format data should l
    // Name: John Doe
    // Email: john.doe@example.com
    // IC: 123456789012 ( no space no dash no dot )
    // Phone: +60123456789 ( no space no dash no dot )
    // Location: Kuala Lumpur, Malaysia ( no space no dash no dot )
    // Customer form --------------------------------->
    // Location: Kuala Lumpur, Malaysia ( no space no dash no dot )
    
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: toEmail,
      subject: 'New GAP Registration',
      text: `New registration received:

Name: ${formData.fullName}
Email: ${formData.email}
IC: ${formData.icNumber}
Phone: +6${formData.phone}

Customer form --------------------------------->
Location: ${formData.location}
For Dealer: ${toEmail}
`,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error sending email:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
} 