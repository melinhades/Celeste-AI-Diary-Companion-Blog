# Celeste AI Diary Companion Blog

![Celeste AI Diary Companion](https://img.shields.io/badge/Java-17%2B-orange.svg?style=for-the-badge&logo=java)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.x-brightgreen.svg?style=for-the-badge&logo=spring)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)
![Last Updated](https://img.shields.io/badge/Last%20Updated-August%202026-blue.svg?style=for-the-badge)
![Frontend: Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-blueviolet.svg?style=for-the-badge)
![AI Engine: GLM-4](https://img.shields.io/badge/AI%20Engine-GLM--4-purple.svg?style=for-the-badge)
![Diary+Blog](https://img.shields.io/badge/Diary%2FBlog-50%25%2F50%25-orange.svg?style=for-the-badge)

A unique dual-platform system that combines private AI-assisted diary writing with optional public blog sharing. Built on the Celeste (Celeste) theme using Java 17 + Spring Boot backend and native HTML/CSS/JS frontend, this platform offers immersive AI companionship for personal reflection while providing the tools to transform meaningful entries into public blog posts.

> ⚠️ Important Notice
This is an open‑source project for personal study and demonstration. **It is NOT an official project of Extremely OK Games / Celeste and has not obtained official authorization.**
Celeste, Madeline and Oshiro are intellectual properties owned by Extremely OK Games.
All assets within this repository are AI‑generated derivative fan‑works. **This repository does NOT contain or distribute any original resources extracted from the Celeste game.**
This project is completely non‑commercial and for educational purposes only.
## 📋 Project Overview

The Celeste AI Diary Companion Blog offers a unique hybrid experience where users maintain private AI-assisted diaries that can optionally be shared as public blog posts. 

Users write diaries here, with AI companion **Madeline** (warm, sincere, delicate) providing constant companionship: offering writing feedback, proactive check-ins, chatting, feather breathing gameplay, daily postcards, and bookshelf snapshot postcards. The innkeeper **Oshiro** (tsundere) permanently resides on the shop page.

This dual-platform approach creates a meaningful flow: intimate personal reflections in the diary can evolve into thoughtful blog entries when users choose to share their insights with others.

### ✨ Features Highlight

| Feature | Description | Status |
|---------|-------------|---------|
| 🤖 **AI Companionship** | Madeline provides intelligent, emotionally-aware interactions | ✅ Complete |
| 🎮 **Interactive Games** | Feather breathing game for relaxation | ✅ Complete |
| 💌 **Memory System** | Daily postcards & monthly snapshots | ✅ Complete |
| 📝 **Private Diary Writing** | Secure, formatted text with auto-save & AI feedback | ✅ Complete |
| 🌐 **Public Blog Sharing** | Transform diary entries into blog posts with one click | ✅ Complete |
| 🔄 **Diary-to-Blog Flow** | Seamless transition from private reflection to public sharing | ✅ Complete |
| 🏪 **Strawberry Economy** | Earn rewards through writing & engagement | ✅ Complete |
| 👕 **Customization** | Themes, decorations & personalization options | 🔄 In Progress |
| 📊 **Analytics** | Emotion tracking, writing insights & engagement metrics | 🔄 In Progress |

### System Architecture

- **Frontend**: Native HTML + JS + CSS, framework-free, located in `blog-ui/` directory
- **Backend**: Java 17 + Spring Boot + MyBatis-Plus, port **8888**, module `blog-api`, package `com.mszlu.blog`
- **AI Engine**: SiliconFlow gateway — GLM-4 (chat, supporting JSON mode `AiClient.chat(messages, true)`) + bge-m3 (embedding, RAG memory retrieval)
- **Database**: MySQL `blog@localhost:3306`
- **Development Environment**: Windows 11 + IntelliJ + IntelliJ IDEA + PowerShell

## 📁 Project Structure


```
blog/
├── blog-api/              # Spring Boot backend application
│   ├── src/
│   │   └── main/
│   │       ├── java/com/mszlu/blog/
│   │       │   ├── controller/    # Controller layer
│   │       │   ├── service/       # Service layer
│   │       │   ├── impl/          # Service implementations
│   │       │   ├── utils/         # Utility classes
│   │       │   └── entity/        # Entity classes
│   │       └── resources/         # Configuration files
│   └── pom.xml            # Maven configuration
├── blog-admin/            # Admin backend (minimal implementation)
│   └── pom.xml
├── blog-ui/               # Frontend static resources
│   ├── js/                # JavaScript files
│   │   ├── api.js         # API encapsulation, strawberry balance
│   │   ├── diary.js       # Diary core (~2400 lines)
│   │   ├── write-madeline.js  # Madeline pixel character
│   │   ├── feather-game.js    # Feather breathing game
│   │   └── ...            # Other JS files
│   ├── css/               # Style files
│   │   └── diary.css      # Complete diary styling (~940 lines)
│   ├── *.html             # HTML pages
│   │   ├── diary.html     # Diary page
│   │   ├── write.html     # Writing page
│   │   ├── shop.html      # Oshiro Inn (~800 lines)
│   │   ├── shelf.html     # Bookshelf (~830 lines)
│   │   ├── me.html        # Personal space
│   │   └── ...            # Other pages
│   ├── celeste-sounds/    # Sound assets
│   │   └── madeline/      # Madeline voice lines
│   ├── celeste-*          # Other Celeste theme resources
│   └── uploads/           # Upload files directory
├── pom.xml                # Parent Maven configuration
├── fix-*.js               # Fix scripts
└── 如何在浏览器访问.md    # Browser access guide
```
## 📸 Screenshots

### 🔐 Login

> *"This is Madeline. Let's climb together."*

<p align="center">
  <img src="docs/screenshots/login.png" alt="Login Page" width="720">
</p>

The gateway to your climbing journey. A parchment-textured card floats on a starry night sky — Madeline's avatar greets you at the top, with clean account/password fields below. New users can jump to registration via the "Sign up" link. The entire login flow uses Celeste's signature warm paper-on-dark aesthetic.

### 🏠 Index (Blog Feed)

> *Where your reflections become stories worth sharing.*

<p align="center">
  <img src="docs/screenshots/index.png" alt="Index Page" width="720">
</p>

The main hub of the public blog. Articles are displayed as elegant dark cards with metadata (author, date, read time, likes), filterable by category (`All` / `Tech` / `Life` / `Study`) and searchable via the header bar. The right sidebar surfaces **Popular** posts and a **Tags** cloud for discovery. Top navigation provides quick access to Archives, My Space, article writing, and logout.

### 📖 Diary

> *Every word has warmth, every day has meaning.*

<p align="center">
  <img src="docs/screenshots/diary.png" alt="Diary Page" width="720">
</p>

The heart of the application — a postcard-style diary reader where Madeline presents your past entries as beautiful mailed letters (complete with stamps and postmarks). At the bottom, Madeline herself appears in a Celeste-style dialogue box, providing real-time companionship and emotional support. Decorative collectables (strawberries, cassettes, blue birds, golden hearts) float around the page, tracking your writing journey. The feather game button in the corner offers a breathing exercise whenever you need a moment of calm.

### 🌟 My Space

> *Your personal summit — every step counted.*

<p align="center">
  <img src="docs/screenshots/namespace.png" alt="My Space Page" width="720">
</p>

A character-themed profile dashboard set against Celeste's rocky mountain backdrop. Your ticket-card displays collected stickers and avatars, while a stats panel tracks your **strawberry** (🍓 writing rewards), **cassette** (📼 memories), and **chili** (🌶️ challenges) balances. Celeste NPCs — Theo with his camera, Granny on her porch — share the scene with you, making your space feel alive and inhabited.

### ✍️ Write Article

> *From private thoughts to public stories — one Publish away.*

<p align="center">
  <img src="docs/screenshots/write.png" alt="Write Article Page" width="720">
</p>

A full Markdown editor set against a dreamy purple twilight sky with a soaring bird silhouette. The toolbar supports rich formatting (Bold, Headings, Code Blocks, Quotes, Links, Lists, Images), plus Celeste-specific tools: **Madeline** (insert character references), **润色/Polish** (AI-assisted text refinement), and **生成文章/Generate Article** (AI-powered article generation). Articles can be saved as drafts or published directly to the blog feed, completing the diary-to-blog flow.

## 🚀 Quick Start
<!-- ... existing code ... -->

## 🚀 Quick Start

### Prerequisites

- Java 17+
- Maven 3.6+
- MySQL 5.7+
- Node.js (optional, for frontend development server)

### Installation Steps

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd blog
   ```

2. **Configure Database**
   - Create MySQL database: `CREATE DATABASE blog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
   - Modify `blog-api/src/main/resources/application.yml` to configure database connection

3. **Start Backend Service**
   ```bash
   cd blog-api
   mvn spring-boot:run
   # Or run via IDE main method
   ```
   Backend service will start at `http://localhost:8888`

4. **Start Frontend Service**
   ```bash
   # Method 1: Directly open HTML files (recommended for development)
   # Double-click any HTML file in blog-ui/ directory
   
   # Method 2: Use simple HTTP server
   cd blog-ui
   python -m http.server 8080  # Python 3
   # Or
   npx serve .                 # Node.js
   # Or use IDE Live Server plugin
   ```
   Frontend will be accessible at `http://localhost:8080`

5. **Access System**
   - Homepage: `http://localhost:8080/index.html`
   - Diary: `http://localhost:8080/diary.html`
   - Writing page: `http://localhost:8080/write.html`
   - Bookshelf: `http://localhost:8080/shelf.html`
   - Shop: `http://localhost:8080/shop.html`

## 🎯 Core Features

### AI Companionship System

- **Madeline AI Companion**: Based on GLM-4 intelligent chat, supports JSON mode returning structured emotion data
- **Emotion Recognition & Feedback**: AI automatically analyzes diary emotions, returning 7 valid emotion tags (default/cute/anxious/unhappy/surprised/resentful/speechless)
- **Proactive Care**: Sends automatic care messages daily at 9:30 AM
- **Feather Breathing Game**: Interactive mini-game providing relaxation experience
- **RAG Memory System**: Based on bge-m3 embedding for memory retrieval augmented generation

### Diary Features

- **Rich Text Writing**: Supports formatted diary writing
- **Auto-save**: Real-time draft saving to prevent loss
- **Emotion Analysis**: AI real-time analysis of writing content emotion changes
- **Intelligent Feedback**: Madeline provides timely feedback and suggestions based on writing content

### Memory & Review

- **Daily Postcards**: AI generates exclusive postcards based on daily diary entries
- **Monthly Snapshot System**:
  - Triggered by ≥3 entries in 7 days or ≥8 entries in 30 days
  - Generates Madeline's reflections for this period + emotion summary
  - Supports legacy snapshot lazy fill mechanism
  - Emotion keywords highlighted in red
- **Bookshelf Snapshots**: Diary card-style display, supports postcard export

### Interactive Elements

- **Oshiro Inn**: Interact with innkeeper Oshiro on shop page
- **Strawberry Economy System**: Earn strawberry balance through diary writing
- **Personalized Customization**: Unlock various themes and decorations

## 📚 Technical Explanation

### 🔧 Backend Core Components

#### AI Service Layer
- `service/ai/PromptBuilder.java`: Centralized AI prompt construction
  - `chatSystem`: Foundational dialogue prompt establishing Madeline's personality
  - `diaryCompanion`: Specialized prompt for diary interactions (includes emotion analysis tool specification)
  - `dailyPostcard`: Template for generating personalized daily postcards based on diary content
  - `oshiroChat`: Unique prompt for the tsundere innkeeper Oshiro character

- `service/ai/AiClient.java`: GLM-4 API integration wrapper
  - Dual-mode support: Standard chat and JSON-structured responses
  - Automatic error handling with retry mechanisms
  - Response parsing for emotion extraction and content generation
  - Token usage tracking and optimization

#### Core Business Logic
- `impl/DiaryServiceImpl.java`: Primary diary & blog management service
  - Complete CRUD operations for diary entries
  - Blog post creation from selected diary entries
  - Privacy controls for diary-to-blog transitions
  - `companion()`: Real-time AI feedback during writing
  - `summary()`: Automatic diary summarization for previews
  - `snapReflect()`: Monthly reflection generation (emotion trend analysis)
  - `dailyPostcard()`: AI-generated visual postcards
  - `bubble()`: Proactive care message system (scheduled 9:30 AM daily)
  - `featherKeyword()`: Triggers for feather breathing game activation

- `impl/ChatServiceImpl.java`: Main conversational AI handler
  - Processes complex JSON responses `{reply: string, emotion: string, suggestions: array}`
  - Emotion validation against 7 allowed states
  - Context management for multi-turn conversations

- `impl/MemoryServiceImpl.java`: Advanced memory and RAG system
  - Memory extraction from diary entries using NLP techniques
  - bge-m3 embedding-based semantic search (`searchContext`)
  - Context augmentation for more relevant AI responses
  - `ContextChunk` object: `{source, text, label, relevanceScore}`

#### Supporting Infrastructure
- `utils/UserThreadLocal.java`: Thread-safe user context storage
- Configuration classes for AI parameters and service beans
- Exception handlers and validation utilities

### 🎨 Frontend Core Components

#### API & Data Layer
- `js/api.js`: Centralized API communication
  - `api(path, method, body)`: Promise-based fetch wrapper with error handling
  - Interceptors for authentication and loading states
  - `berryBalance()`: Strawberry economy state management
  - Request/response logging for debugging

#### Diary Application Core
- `js/diary.js`: Main diary application (~2400 lines)
  - Immersive typewriter effect with configurable speed
  - Real-time AI companion engine with streaming responses
  - Emotion analysis UI with visual feedback
  - Integrated feather breathing game controls
  - Autosave with localStorage synchronization
  - Responsive cover generation and postcard rendering
  - Export functionality for sharing entries

#### UI & Interaction Components
- `js/write-madeline.js`: Madeline pixel avatar controller
  - 8-directional posture system (idle, writing, thinking, celebrating, etc.)
  - Resource loading optimizer (`pmSetSrc`/`pmApplySize`)
  - Spatial audio positioning with `playSpeak()`
  - Animation queue system for smooth transitions

- `js/feather-game.js`: Physics-based mini-game
  - Box2D-inspired gravity and collision simulation
  - Wind resistance and trajectory calculation
  - Precision landing detection with scoring
  - Custom event system (`feather-landed`) for UI integration
  - Difficulty scaling based on user streaks

#### Styling & Assets
- CSS architecture using BEM methodology
- Custom Celeste-themed font pairing (Renogare + CelesteZH)
- Optimized asset loading with lazy loading strategies
- Dark/light theme support through CSS variables

## 🔧 Configuration Explanation

### Backend Configuration (`blog-api/src/main/resources/application.yml`)

```yaml
server:
  port: 8888

spring:
  datasource:
    url: jdbc:mysql://localhost:3306/blog?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=UTC
    username: root
    password: your_password
    driver-class-name: com.mysql.cj.jdbc.Driver
  jpa:
    hibernate:
      ddl-auto: update
    show-sql: true
  redis:
    host: localhost
    port: 6379
  mail:
    host: smtp.qq.com
    username: your_email@qq.com
    password: your_password
    properties:
      mail:
        smtp:
          auth: true
          starttls:
            enable: true
            required: true

# AI configuration
ai:
  glm4:
    api-key: your_glm4_api_key
    api-url: https://api.biminl.com/v1/chat/completions
  embedding:
    model: bge-m3
```

### Frontend Configuration

Frontend primarily communicates with backend through base URL configuration in `js/api.js`:
```javascript
const BASE_URL = 'http://localhost:8888';  // Modify according to actual deployment
```

## 🤝 Contribution Guide

We welcome contributions from the community! Please read our [Contribution Guidelines](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests.

### 📝 How to Contribute

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### ⚙️ Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/blog.git
cd blog

# Install dependencies (if any)
# Backend: Maven handles dependencies
# Frontend: No build step required for basic functionality

# Run the application following the Quick Start guide above
```

### 🔧 Collaboration Guidelines

Based on AI handover document experience lessons, please strictly adhere to the following collaboration iron laws:

1. **Code Modification Verification**: After each modification, when user reports exceptions, the first action is to re-read the file to confirm the actual state, not believing "it should have been fixed last time"

2. **Avoid Placeholder Comments**: Absolutely do not write `// ... existing code ...` placeholder comments in actual files

3. **Complete Replacement Confirmation**: When replacing entire function segments, confirm old function remnants are completely cleaned up

4. **JS Modification Standard**: JS modifications should provide **complete code block + precise line number position**; before deleting HTML elements, must check JS references and add null protection

5. **Global Fonts**: All text uses **Renogare + CelesteZH**, only `#gameDialogName` uses Press Start 2P

6. **Asset Path Attention**: `celeste-sounds/madeline/...` has `madeline/` layer, don't miss when constructing paths

7. **GIF Handling**: Pixel characters **cannot use canvas scanning for size calibration**, directly use fixed pixel values

8. **Commit Summary**: When user says "submit", summarize uncommitted changes for proposed commit messages

## ❓ Frequently Asked Questions

### General Questions

**Q: What is the Celeste AI Diary Companion Blog?**  
A: It's an immersive diary-writing platform where users interact with AI companions (Madeline and Oshiro) while journaling, featuring games, memory systems, and personalized experiences.

**Q: Do I need to know programming to use this?**  
A: No! The application is designed for end-users. Programming knowledge is only needed for development or customization.

**Q: Is this mobile-friendly?**  
A: Yes, the responsive design works on mobile devices, though the experience is optimized for desktop/tablet screens.

### Technical Questions

**Q: What AI models power this application?**  
A: The system uses GLM-4 for natural language interactions and bge-m3 for embeddings in the retrieval-augmented generation (RAG) system.

**Q: How is my data stored and protected?**  
A: Diary entries are stored in a MySQL database. For production use, you should implement appropriate security measures including encryption, access controls, and regular backups.

**Q: Can I use my own AI API key?**  
A: Yes! Simply replace `your_glm4_api_key` in the `application.yml` file with your actual SiliconFlow API key.

### Troubleshooting

| Symptom | First Check Position |
|---------|----------------------|
| Page功能没生效 | Read file to confirm changes are actually there → Browser cache |
| Backend接口 404 | Whether 8888 port service has been restarted |
| 编译"找不到符号" | Import package position (UserThreadLocal in utils package) |
| 构造器参数不匹配 | `@AllArgsConstructor` field order = parameter order |
| 声音 404 | Whether path is missing `madeline/` layer (like `celeste-sounds/madeline/...`) |
| 情绪显示异常 | Check if AI return is in 7 valid values, illegal fallbacks to "default" |
| diarySaveCount异常 | Check localStorage diary count logic |
| 情感分析不准确 | Verify AI service is running and API key is valid |
| 羽毛游戏无反应 | Check browser console for JavaScript errors |
| 明星片生成失败 | Ensure backend service is running and check logs for AI API errors |

## 🐅 Common Issues Troubleshooting (Detailed)

For persistent issues, please consult the detailed troubleshooting guide in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 📈 Future Planning

1. **Verify Current Functionality**: Confirm monthly snapshot lazy fill + backend restart after snapshot reflections display normally
2. **完善遗留项**: Handle user feedback from AI handover document section 6遗留项
3. **提交管理**: When user says "submit", organize proposed commit information by功能 blocks
4. **性能优化**: Optimize retrieval and rendering performance for large diary and blog volumes
5. **功能扩展**: 
   - Enhance diary-to-blog workflow with more sharing options
   - Add blog-specific features (comments, tags, categories)
   - Improve discoverability of public blog content
   - Consider adding more AI interaction scenarios and theme customization
6. **社区功能**: Explore lightweight social features for blog readers while maintaining diary privacy

## 📄 Related Documents

- [如何在浏览器访问.md](如何在浏览器访问.md) - Frontend access说明
- [blog-ui/AI交接文档.md](blog-ui/AI交接文档.md) - Detailed development handover document
- 各模块pom.xml - Dependencies and build configuration

## 👥 Contributors

- Initial development team
- AI handover document maintainers (2026-08-30)
- Contribute your code!

---

> **Note**: This is an educational and demonstration project. Please ensure security assessment and data protection measures are completed before actual deployment.
> 
> Celeste AI Diary Companion Blog - Let every word have warmth, let every day have meaning.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Celeste](https://celestegame.com/) for the inspiring art style and characters
- [SiliconFlow](https://siliconflow.cn/) for providing the GLM-4 and bge-m3 model access
- [MyBatis-Plus](https://baomidou.com/) for simplifying database operations
- All contributors who have helped shape this project
