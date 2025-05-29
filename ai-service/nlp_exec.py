#!/usr/bin/env python3
"""
Gemini Chat Interface for Timetable Modification

This script uses the Google Generative AI (Gemini) model to provide an interactive conversational
interface for modifying an academic timetable. When a user types a command describing a change
(e.g., "swap the subject X in slot Y on Monday with subject Z in slot W on Monday"), the Gemini API is
called with a detailed prompt. The model is instructed to output a valid JSON object with an "action"
(e.g., "swap_subjects", "shift_teacher", or "update_classroom") and a "details" object containing the
parameters (such as day, slot numbers, subject names, teacher names, room numbers, etc.) needed to update
the timetable.

Note: In a full system, you would take the generated modification plan and pass it to your timetable
updating routines (for example, via an HTTP request to your timetableupdater.js endpoint).

Before running:
  • Install the Google Gen AI package (e.g., via `pip install -q -U google-genai`)
  • Set the environment variable GOOGLE_API_KEY with your API key.

Usage:
    python nlp_exec.py
"""

import os
import sys
import json
from google import genai

def generate_modification_plan(prompt: str) -> str:
    api_key = "AIzaSyDurrWhYB2hV234MlrKpPaQYUNX54cubmI"
    if not api_key:
        sys.exit("Error: Please set the GOOGLE_API_KEY environment variable.")
    
    # Instantiate the Gemini client with your API key.
    client = genai.Client(api_key=api_key)
    
    # Call the Gemini model (you can change the model name as needed)
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents=prompt
    )
    return response.text

def main():
    print("Welcome to the Gemini-based Timetable Modification Chat Interface!")
    print("Type your command (e.g., 'swap the subject ...') or 'exit' to quit.")
    
    while True:
        user_input = input(">> ")
        if user_input.lower() in ["exit", "quit"]:
            print("Exiting chat interface.")
            break

        # Construct a detailed prompt for Gemini.
        prompt = (
            "You are a helpful AI assistant specialized in academic timetabling. "
            "Based on the following user command, generate a JSON object with exactly two keys: "
            "\"action\" and \"details\". "
            "The \"action\" value should be a string representing the type of modification (e.g., "
            "\"swap_subjects\", \"shift_teacher\", \"update_classroom\"). "
            "The \"details\" value must be an object that includes all necessary details (such as day, slot numbers, "
            "subject names, teacher names, room numbers, etc.) to update the timetable without conflicts. "
            "If the command is ambiguous or incomplete, return a JSON object with an \"action\" of \"clarify\" "
            "and a \"details\" object containing a \"message\" asking for clarification. \n"
            "User command: \"" + user_input + "\"\n"
            "Respond with a valid JSON object."
        )

        print("Generating modification plan using Gemini... please wait.")
        raw_output = generate_modification_plan(prompt)
        print("Raw Gemini output:")
        print(raw_output)

        try:
            plan = json.loads(raw_output)
            print("Parsed Modification Plan:")
            print(json.dumps(plan, indent=2))
        except Exception as e:
            print("Error: The generated output is not valid JSON. Please try rephrasing your command.")
            print("Raw output:")
            print(raw_output)

if __name__ == "__main__":
    main()