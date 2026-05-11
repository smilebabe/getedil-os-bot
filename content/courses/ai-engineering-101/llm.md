# Module 4: LLM Integration

## What is an LLM?

Large Language Model = AI trained on massive text data.

| Model | Maker | Best For | Free Tier |
|---|---|---|---|
| Gemini 2.5 Flash | Google | Amharic, multimodal | 1,500 req/day |
| Llama 3.3 (Groq) | Meta | Speed, general | 14,400 req/day |
| GPT-4o | OpenAI | Complex reasoning | Limited free |
| DeepSeek V4 | DeepSeek | Code, math | 50 req/day |

## How to Use LLMs in Your Apps

### Step 1: Choose a Model
Pick based on: language support, cost, speed, task type

### Step 2: Get an API Key
Sign up on the provider's website → generate key → keep it secret!

### Step 3: Send a Request

```python
import requests

response = requests.post(
    "https://api.groq.com/openai/v1/chat/completions",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "user", "content": "Hello in Amharic?"}]
    }
)
print(response.json()["choices"][0]["message"]["content"])
Step 4: Build Features
Chatbots, content generators, analyzers, translators
Best Practices
Validate output — LLMs can hallucinate

Set temperature — 0.0 for facts, 0.7 for creativity

Use system prompts — Control AI behavior

Handle errors — APIs fail, have fallbacks

Track costs — Free tiers have limits
Exercise: Build Your First AI Call
Write a Python script that:

Uses the Groq API (free key: console.groq.com)

Sends a prompt about Ethiopian food

Prints the response
Quiz
API key should be:
a) Shared publicly
b) Kept secret
c) Written in code
d) Emailed to friends

Temperature 0.0 is best for:
a) Creative writing
b) Facts and accuracy
c) Poetry
d) Jokes

System prompts control:
a) Computer temperature
b) AI behavior and personality
c) Internet speed
d) API pricing

Answers: 1-b, 2-b, 3-b

Next: /learn ai apps
