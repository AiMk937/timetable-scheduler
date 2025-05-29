#!/usr/bin/env python3
"""
Chat Execution Script

This script implements a conversational chat interface using the Google Generative AI API.
Users can send messages and receive responses from the AI. The conversation history is maintained
in memory for context. This file has been renamed from any reference to "Gemini."

Before running:
  • Install the required packages:
      pip install flask google-genai
  • Set the environment variable GOOGLE_API_KEY with your API key.

Usage:
    python chat_exec.py
"""

import os
import sys
from flask import Flask, request, jsonify, render_template
from google import genai  # Provided by the google-genai package

app = Flask(__name__)

# Get API key from environment variable
API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    sys.exit("Error: Please set the GOOGLE_API_KEY environment variable.")

# Instantiate the Generative AI client using your API key.
client = genai.Client(api_key=API_KEY)
# Get the generative model (reference it generically)
model = client.models.generate_content

# In-memory conversation history (for demonstration)
conversation_history = []

@app.route("/")
def index():
    """Render a simple chat page."""
    return render_template("chat_interface.html", history=conversation_history)

@app.route("/chat", methods=["POST"])
def chat():
    """Receive a user message, call the generative API, and return a reply."""
    user_message = request.form.get("message")
    if not user_message:
        return jsonify({"error": "No message provided."}), 400

    # Append user's message to the conversation history.
    conversation_history.append({"sender": "User", "message": user_message})

    # Build prompt by concatenating conversation history.
    prompt = "\n".join([f"{entry['sender']}: {entry['message']}" for entry in conversation_history])
    prompt += "\nAssistant:"  # prompt for the AI response

    try:
        result = model(model="gemini-1.5-flash", contents=prompt)
        ai_response = result.text.strip()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # Append AI's response to conversation history.
    conversation_history.append({"sender": "Assistant", "message": ai_response})
    return jsonify({"response": ai_response})

if __name__ == "__main__":
    # Run the Flask app on port 5002 (or choose a port)
    app.run(port=5002, debug=True)