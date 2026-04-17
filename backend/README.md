# NEXUS CORE 

NEXUS CORE is an advanced AI-driven platform built for secure data  and real-time interaction. It leverages the **Gemini 2.5 Flash lite** model for intelligent analysis, with a robust backend powered by **Node.js** and **MongoDB**.

---

## 🚀 How to Setup and Run (Step-by-Step)

### 1. Clone the Project
Open your terminal and download the repository:
```bash
git clone (https://github.com/BCA-444-9829-ADITYA-KUMAR-SINGH/NEXUS-CORE.git)

cd nexus-core
Install Dependencies
Install all the required Node.js packages:


npm install
3. Environment Configuration
Create a file named .env in the root directory. Copy and paste the following keys into it, filling in your actual credentials:

PORT=5000
MONGO_URI=your_mongodb_connection_string
GEMINI_API_KEY=your_google_ai_key
JWT_SECRET=your_secure_random_string
(Note: Refer to .env.example for the variable template. )

4. Launch the Application
Start the server using the following command:

npm start

5. Access in Browser
Once the terminal shows "Server running on port 5000", open:
http://localhost:5000