# Module 3: Vector Databases

## What are Vectors?

In AI, words are converted to numbers called vectors. Similar concepts get similar numbers.

"king" → [0.8, 0.3, 0.1, ...]
"queen" → [0.7, 0.4, 0.1, ...] (close to king)
"apple" → [0.1, 0.9, 0.2, ...] (far from king)

This is called "embedding" — turning meaning into math.

## What is a Vector Database?

A database that stores and searches these number arrays by meaning, not by exact keyword match.

| Traditional DB | Vector DB |
|---|---|
| Search: "car" | Search: "vehicle" |
| Finds: only "car" | Finds: "car", "truck", "bus", "automobile" |

## Why This Matters

| Application | How It Works |
|---|---|
| Semantic Search | Find documents by meaning |
| Recommendations | "Users who liked this also liked..." |
| RAG | Give AI relevant context before answering |
| Image Search | Find visually similar images |
| Chatbot Memory | Remember past conversations by topic |

## Popular Tools

| Tool | Best For |
|---|---|
| Pinecone | Managed, easy to start |
| Weaviate | Open source, GraphQL |
| Supabase pgvector | Free tier, PostgreSQL |
| ChromaDB | Python-native, simple |

## RAG: The Killer App

**RAG = Retrieval Augmented Generation**

1. User asks: "What's our return policy?"
2. System searches company docs for "return policy"
3. Finds relevant paragraphs
4. Sends to AI: "Here's the policy: [text]. Answer the user."
5. AI responds with accurate, sourced answer

## Exercise 1: Think in Vectors

Which pairs would be closest in a vector database?
1. "coffee" and "tea" OR "coffee" and "car"
2. "Addis Ababa" and "Ethiopia" OR "Addis Ababa" and "Nairobi"
3. "Python" and "programming" OR "Python" and "snake"

## Exercise 2: RAG Use Case

Describe a scenario where RAG would be useful:
- What would the user ask?
- What documents would you search?
- How would the AI respond better with RAG?

## Quiz

1. Vectors are:
   a) Images
   b) Numbers representing meaning
   c) Database tables
   d) Programming languages

2. RAG stands for:
   a) Random Access Generator
   b) Retrieval Augmented Generation
   c) Rapid AI Growth
   d) Read And Go

3. A vector database searches by:
   a) Exact keyword match
   b) Meaning and similarity
   c) Alphabetical order
   d) File size

**Answers:** 1-b, 2-b, 3-b

**Next:** /learn ai llm
