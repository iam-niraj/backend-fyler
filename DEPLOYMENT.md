# Deployment Guide

This guide provides instructions for deploying the Flask application to various platforms.

## Prerequisites

- Python 3.6+
- Git

## Heroku Deployment

1. Create a Heroku account if you don't have one: https://signup.heroku.com/
2. Install the Heroku CLI: https://devcenter.heroku.com/articles/heroku-cli
3. Login to Heroku:
   ```
   heroku login
   ```
4. Create a new Heroku app:
   ```
   heroku create your-app-name
   ```
5. Push your code to Heroku:
   ```
   git push heroku main
   ```
6. Ensure at least one instance is running:
   ```
   heroku ps:scale web=1
   ```
7. Open your app:
   ```
   heroku open
   ```

## Render Deployment

1. Create a Render account: https://render.com/
2. Create a new Web Service
3. Connect your GitHub repository
4. Use these settings:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app`
5. Select the appropriate plan and deploy

## Railway Deployment

1. Create a Railway account: https://railway.app/
2. Create a new project from GitHub
3. Connect your repository
4. Add a service from your GitHub repo
5. Add an environment variable:
   - `PORT`: `5000`
6. Railway will automatically detect your Procfile and deploy

## Manual VPS Deployment

1. SSH into your server
2. Clone your repository
3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
4. Start the application with gunicorn:
   ```
   gunicorn app:app -b 0.0.0.0:5000
   ```
5. For production, set up a process manager like supervisor or systemd
6. Set up Nginx as a reverse proxy (recommended)

## Environment Variables

The following environment variables can be configured:

- `PORT`: The port to run the server on (default: 5000)
