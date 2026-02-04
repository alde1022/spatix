"""
Email Service for Spatix
Supports: Resend (recommended), SendGrid, or SMTP
"""

import os
import httpx
from typing import Optional

# Config - set one of these
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY")
SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASS = os.environ.get("SMTP_PASS")

FROM_EMAIL = os.environ.get("FROM_EMAIL", "noreply@spatix.io")
FROM_NAME = os.environ.get("FROM_NAME", "Spatix")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://spatix.io")


async def send_email(to: str, subject: str, html: str, text: Optional[str] = None):
    """Send email using configured provider"""
    
    if RESEND_API_KEY:
        await send_via_resend(to, subject, html, text)
    elif SENDGRID_API_KEY:
        await send_via_sendgrid(to, subject, html, text)
    elif SMTP_HOST:
        await send_via_smtp(to, subject, html, text)
    else:
        print(f"[EMAIL] No provider configured. Would send to {to}: {subject}")
        # In dev, just log the email
        return


async def send_via_resend(to: str, subject: str, html: str, text: Optional[str] = None):
    """Send email via Resend API"""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "from": f"{FROM_NAME} <{FROM_EMAIL}>",
                "to": [to],
                "subject": subject,
                "html": html,
                "text": text or ""
            }
        )
        
        if resp.status_code not in (200, 201):
            raise Exception(f"Resend error: {resp.status_code} {resp.text}")


async def send_via_sendgrid(to: str, subject: str, html: str, text: Optional[str] = None):
    """Send email via SendGrid API"""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={
                "Authorization": f"Bearer {SENDGRID_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "personalizations": [{"to": [{"email": to}]}],
                "from": {"email": FROM_EMAIL, "name": FROM_NAME},
                "subject": subject,
                "content": [
                    {"type": "text/plain", "value": text or ""},
                    {"type": "text/html", "value": html}
                ]
            }
        )
        
        if resp.status_code not in (200, 201, 202):
            raise Exception(f"SendGrid error: {resp.status_code} {resp.text}")


async def send_via_smtp(to: str, subject: str, html: str, text: Optional[str] = None):
    """Send email via SMTP (synchronous, wrapped)"""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    import asyncio
    
    def _send():
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
        msg["To"] = to
        
        if text:
            msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
        
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            if SMTP_USER and SMTP_PASS:
                server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(FROM_EMAIL, to, msg.as_string())
    
    await asyncio.to_thread(_send)


# ============ Email Templates ============

async def send_verification_email(to: str, token: str):
    """Send email verification link"""
    verify_url = f"{FRONTEND_URL}/auth/verify?token={token}"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #2563eb; border-radius: 12px; line-height: 48px;">
                <span style="color: white; font-size: 24px;">🗺️</span>
            </div>
            <h1 style="margin: 16px 0 0 0; font-size: 24px; font-weight: 600;">Spatix</h1>
        </div>
        
        <div style="background: #f8fafc; border-radius: 12px; padding: 32px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 16px 0; font-size: 20px;">Verify your email</h2>
            <p style="margin: 0 0 24px 0; color: #64748b;">
                Thanks for signing up! Click the button below to verify your email address and activate your account.
            </p>
            <a href="{verify_url}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500;">
                Verify Email
            </a>
        </div>
        
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">
            This link expires in 24 hours. If you didn't create an account, you can ignore this email.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
        
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            Button not working? Copy and paste this link:<br>
            <a href="{verify_url}" style="color: #2563eb;">{verify_url}</a>
        </p>
    </body>
    </html>
    """
    
    text = f"""
Verify your Spatix email

Thanks for signing up! Click the link below to verify your email address:

{verify_url}

This link expires in 24 hours. If you didn't create an account, you can ignore this email.
    """
    
    await send_email(to, "Verify your Spatix account", html, text)


async def send_password_reset_email(to: str, token: str):
    """Send password reset link"""
    reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #2563eb; border-radius: 12px; line-height: 48px;">
                <span style="color: white; font-size: 24px;">🗺️</span>
            </div>
            <h1 style="margin: 16px 0 0 0; font-size: 24px; font-weight: 600;">Spatix</h1>
        </div>
        
        <div style="background: #f8fafc; border-radius: 12px; padding: 32px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 16px 0; font-size: 20px;">Reset your password</h2>
            <p style="margin: 0 0 24px 0; color: #64748b;">
                We received a request to reset your password. Click the button below to choose a new one.
            </p>
            <a href="{reset_url}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500;">
                Reset Password
            </a>
        </div>
        
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">
            This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
        
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            Button not working? Copy and paste this link:<br>
            <a href="{reset_url}" style="color: #2563eb;">{reset_url}</a>
        </p>
    </body>
    </html>
    """
    
    text = f"""
Reset your Spatix password

We received a request to reset your password. Click the link below to choose a new one:

{reset_url}

This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
    """
    
    await send_email(to, "Reset your Spatix password", html, text)
