# Celeste AI Diary Companion Blog

![Java](https://img.shields.io/badge/Java-17%2B-orange.svg?style=for-the-badge&logo=java)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-2.5.0-brightgreen.svg?style=for-the-badge&logo=spring)
![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)
![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20JS-blueviolet.svg?style=for-the-badge)
![AI Engine](https://img.shields.io/badge/AI%20Engine-GLM--4-purple.svg?style=for-the-badge)
![Architecture](https://img.shields.io/badge/Architecture-Monorepo%20(Modular)-orange.svg?style=for-the-badge)

A unique dual-platform system that combines private AI-assisted diary writing with optional public blog sharing. Built on the Celeste theme using Java 17 + Spring Boot backend and native HTML/CSS/JS frontend, this platform offers immersive AI companionship for personal reflection while providing the tools to transform meaningful entries into public blog posts.

## 🌐 Live Demo

✨ **The project is officially deployed and live! Welcome to visit!** ✨

*   **Frontend Homepage (Blog & Diary)**: [https://instapix.icu](https://instapix.icu)
*   **Alternate URL**: [https://www.instapix.icu](https://www.instapix.icu)
*   **Backend API Service**: [https://api.instapix.icu](https://api.instapix.icu) *(Pure API service; a 404 on the root path is expected)*

> **Tech Stack Deployment**:
> Frontend is hosted on **Cloudflare Pages**, backend is deployed on **Render (Docker)**, and the cloud database uses **TiDB Cloud (Starter Free Tier)**.
> CORS is configured between frontend and backend, utilizing HTTPS encrypted connections.

---

### 🎥 Demo Video

[![Watch Demo](docs/screenshots/video-cover.png)](https://www.bilibili.com/video/BV13QY764EDX/)

## 🛡️ Disclaimer

This project is an **unofficial, non-commercial fan project**, intended for learning and exchange purposes only, and is not used for any commercial purposes.
The copyrights for Celeste-related art, characters, music, fonts, etc., belong to **Extremely OK Games (Maddy Makes Games)**.
If notified by the copyright holder, I will immediately remove the relevant content.

## 📋 Project Overview

The Celeste AI Diary Companion Blog offers a unique hybrid experience where users maintain private AI-assisted diaries that can optionally be shared as public blog posts.

Users write diaries here, with AI companion **Madeline** (warm, sincere, delicate) providing constant companionship: offering writing feedback, proactive check-ins, chatting, feather breathing gameplay, daily postcards, and bookshelf snapshot postcards. The innkeeper **Oshiro** (tsundere) permanently resides on the shop page.

This dual-platform approach creates a meaningful flow: intimate personal reflections in the diary can evolve into thoughtful blog entries when users choose to share their insights with others.


> ⚠️ **Note**: This project is deployed on **free-tier services** (Render + TiDB Cloud + Upstash). Due to strict resource limits and automatic cold-start sleep policies, the real online experience may be **slower** than the video. The video showcases an ideal, unrestricted environment. Thank you for your patience!


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
| 🔒 **Security Hardened** | BCrypt passwords, JWT env-config, bounded thread pools, magic-number upload validation | ✅ Complete |
| 📈 **Observability Ready** | Actuator + Prometheus metrics, structured logging, health probes | ✅ Complete |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CELESTE BLOG ECOSYSTEM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐  │
│  │   blog-ui/       │      │   blog-api/      │      │  blog-admin/     │  │
│  │  (Frontend)      │◄────►│  (Core API)      │◄────►│  (Admin Panel)   │  │
│  │  Vanilla HTML/   │ REST │  Spring Boot     │      │  Spring Boot +   │  │
│  │  CSS/JS          │      │  2.5.0 + MP      │      │  Spring Security │  │
│  │  Port: 8080/     │      │  Port: 8888      │      │  Port: 8889      │  │
│  │  Direct file     │      │                  │      │                  │  │
│  └──────────────────┘      └────────┬─────────┘      └──────────────────┘  │
│                                     │                                      │
│                    ┌────────────────┼────────────────┐                     │
│                    │                │                │                     │
│              ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐             │
│              │  MySQL    │    │   Redis   │    │ SiliconFlow│             │
│              │  (blog)   │    │  (Cache/  │    │  (GLM-4 +  │             │
│              │  Port 3306│    │  Session/ │    │  bge-m3)   │             │
│              │           │    │  Token)   │    │  AI Gateway│             │
│              └───────────┘    └───────────┘    └─────────────┘             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tech Stack Summary

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Language** | Java | 17 LTS | Type-safe, performant backend |
| **Framework** | Spring Boot | 2.5.0 | Convention-over-configuration |
| **ORM** | MyBatis-Plus | 3.5.3.1 | Enhanced MyBatis with CRUD, pagination |
| **Security** | Spring Security + JWT | 5.x / 0.9.1 | Stateless auth, BCrypt passwords |
| **Cache/Session** | Redis + Lettuce | 6.x | Distributed cache, token store |
| **AI Gateway** | SiliconFlow | - | GLM-4 (chat), bge-m3 (embedding) |
| **Database** | MySQL | 5.7+/8.0 | Primary persistence |
| **Monitoring** | Actuator + Micrometer + Prometheus | 2.5.x / 1.10+ | Metrics, health checks |
| **Build** | Maven | 3.6+ | Multi-module build |
| **Frontend** | Vanilla HTML/CSS/JS | ES6+ | Zero-build, framework-free |
| **Fonts** | Renogare + CelesteZH | - | Pixel-perfect Celeste aesthetic |

---

## 📁 Project Structure

```
blog/
├── pom.xml                              # Parent POM (dependency management)
├── README.md                            # This file
├── CONTRIBUTING.md                      # Contribution guidelines
├── LICENSE                              # MIT License
├── TROUBLESHOOTING.md                   # Detailed troubleshooting guide
├── blog-api/                            # Core backend module
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/mszlu/blog/
│       │   ├── config/                  # Configuration classes
│       │   │   ├── ThreadPoolConfig.java     # Bounded async executor
│       │   │   ├── WebMVCConfig.java         # CORS, interceptors
│       │   │   └── MybatisPlusConfig.java    # MP plugins, ID generator
│       │   ├── controller/              # REST endpoints
│       │   │   ├── ArticleController.java    # Blog articles
│       │   │   ├── CategoryController.java   # Categories
│       │   │   ├── ChatController.java       # AI chat
│       │   │   ├── CommentsController.java   # Comments
│       │   │   ├── DiaryController.java      # Diary entries
│       │   │   ├── FeatherController.java    # Feather game
│       │   │   ├── LikeController.java       # Likes
│       │   │   ├── LoginController.java      # Auth (JWT)
│       │   │   ├── LogoutController.java     # Logout
│       │   │   ├── MemoryController.java     # RAG memory
│       │   │   ├── NotificationController.java # Notifications
│       │   │   ├── PersonaController.java    # AI personas
│       │   │   ├── ProactiveController.java  # Proactive AI
│       │   │   ├── RegisterController.java   # Registration
│       │   │   ├── TagsController.java       # Tags
│       │   │   ├── UploadController.java     # File upload (magic-number validated)
│       │   │   └── UserController.java       # User profile
│       │   ├── dao/
│       │   │   ├── controller/            # (Legacy, being consolidated)
│       │   │   ├── mapper/                # MyBatis mappers
│       │   │   ├── pojo/                  # Entity classes
│       │   │   │   ├── Article.java
│       │   │   │   ├── ArticleBody.java
│       │   │   │   ├── Category.java
│       │   │   │   ├── Comment.java
│       │   │   │   ├── Diary.java
│       │   │   │   ├── SysUser.java
│       │   │   │   └── Tag.java
│       │   │   └── dos/                   # Data objects for complex queries
│       │   ├── handler/
│       │   │   ├── AllExceptionHandler.java    # Global exception handling
│       │   │   └── LoginIntercepter.java       # JWT auth interceptor
│       │   ├── impl/                    # Service implementations
│       │   │   ├── ChatServiceImpl.java
│       │   │   ├── DiaryServiceImpl.java
│       │   │   ├── FeatherServiceImpl.java
│       │   │   ├── LoginServiceImpl.java       # BCrypt + JWT
│       │   │   ├── MemoryServiceImpl.java
│       │   │   ├── SysUserServiceImpl.java
│       │   │   └── ...
│       │   ├── service/                 # Service interfaces
│       │   │   ├── ai/
│       │   │   │   ├── AiClient.java           # GLM-4 client (JSON mode support)
│       │   │   │   ├── PromptBuilder.java      # Centralized prompt engineering
│       │   │   │   └── MemorySearchService.java
│       │   │   ├── ArticleService.java
│       │   │   ├── CategoryService.java
│       │   │   ├── CommentsService.java
│       │   │   ├── DiaryService.java
│       │   │   ├── FeatherService.java
│       │   │   ├── LoginService.java
│       │   │   ├── MemoryService.java
│       │   │   ├── SysUserService.java
│       │   │   └── ThreadService.java      # Async view-count updates
│       │   ├── utils/
│       │   │   ├── HttpContextUtils.java
│       │   │   ├── IpUtils.java
│       │   │   ├── JWTUtils.java               # JWT create/verify (env-configurable)
│       │   │   ├── QiniuUtils.java
│       │   │   └── UserThreadLocal.java        # Thread-local user context
│       │   ├── vo/                      # View objects (API contracts)
│       │   │   ├── Result.java
│       │   │   ├── LoginUserVo.java
│       │   │   └── params/              # Request/Response DTOs
│       │   ├── common/
│       │   │   ├── aop/
│       │   │   │   ├── LogAnnotation.java      # Method-level audit logging
│       │   │   │   └── LogAspect.java          # AOP logging impl
│       │   │   └── cache/
│       │   │       ├── Cache.java              # @Cache annotation
│       │   │       └── CacheAspect.java        # Redis caching AOP
│       │   └── AdminApp.java                    # (Legacy entry point)
│       └── resources/
│           ├── application.properties        # Dev config (with env var placeholders)
│           ├── application-prod.yml          # Production config (HikariCP, security headers, etc.)
│           └── log4j2.xml                    # Structured JSON logging
├── blog-admin/                          # Admin backend module
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/mszlu/blog/admin/
│       │   ├── config/
│       │   │   ├── MybatisPlusConfig.java
│       │   │   └── SecurityConfig.java         # Spring Security form login + RBAC
│       │   ├── controller/
│       │   │   ├── AdminController.java
│       │   │   └── HomeController.java
│       │   ├── mapper/
│       │   │   ├── AdminMapper.java
│       │   │   └── PermissionMapper.java
│       │   ├── pojo/
│       │   │   ├── Admin.java
│       │   │   └── Permission.java
│       │   ├── service/
│       │   │   ├── AdminService.java
│       │   │   ├── AuthService.java            # URL-level permission check
│       │   │   ├── PermissionService.java
│       │   │   └── SecurityUserService.java    # UserDetailsService impl
│       │   ├── vo/
│       │   │   ├── Admin.java
│       │   │   ├── Result.java
│       │   │   └── PageResult.java
│       │   ├── model/params/PageParam.java
│       │   └── utils/PasswordGenerator.java
│       └── resources/
│           ├── application.properties
│           └── application-prod.yml
└── blog-ui/                             # Frontend static assets
    ├── index.html                       # Blog index
    ├── diary.html                       # Diary main page
    ├── write.html                       # Writing editor (Markdown + AI tools)
    ├── shelf.html                       # Bookshelf (snapshots)
    ├── shop.html                        # Oshiro Inn (strawberry economy)
    ├── me.html                          # Personal space
    ├── archives.html                    # Article archives
    ├── article.html                     # Article detail
    ├── login.html / register.html       # Auth pages
    ├── css/
    │   ├── common.css                   # Global styles, variables
    │   └── diary.css                    # Diary-specific (~940 lines)
    ├── js/
    │   ├── api.js                       # API client + strawberry balance
    │   ├── diary.js                     # Diary app core (~2400 lines)
    │   ├── write-madeline.js            # Madeline pixel avatar (8 poses)
    │   ├── feather-game.js              # Feather breathing game (Box2D-like)
    │   ├── auth.js                      # Auth state management
    │   ├── shelf.js                     # Bookshelf interactions
    │   └── feather-game.js
    ├── celeste-sounds/
    │   └── madeline/                    # Voice lines (SE + dialogue)
    ├── celeste-font-en/                 # Renogare font
    ├── celeste-font-zh/                 # CelesteZH font
    ├── celeste-gui/                     # UI textures (backgrounds, stamps)
    └── uploads/                         # User uploads (gitignored)
```

---

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

The main hub of the public blog. Articles are displayed as elegant dark cards with metadata (author, date, read time, likes), filterable by category (`All` / `Tech` / `Life` / `Study`) and searchable via the header bar. The right sidebar surfaces **Popular** posts and a **Tags** cloud for discovery.

### 📖 Diary
> *Every word has warmth, every day has meaning.*

<p align="center">
  <img src="docs/screenshots/diary.png" alt="Diary Page" width="720">
</p>

The heart of the application — a postcard-style diary reader where Madeline presents your past entries as beautiful mailed letters (complete with stamps and postmarks). At the bottom, Madeline herself appears in a Celeste-style dialogue box, providing real-time companionship and emotional support.

### 🌟 My Space
> *Your personal summit — every step counted.*

<p align="center">
  <img src="docs/screenshots/namespace.png" alt="My Space Page" width="720">
</p>

A character-themed profile dashboard set against Celeste's rocky mountain backdrop. Your ticket-card displays collected stickers and avatars, while a stats panel tracks your **strawberry** (🍓 writing rewards), **cassette** (📼 memories), and **chili** (🌶️ challenges) balances.

### ✍️ Write Article
> *From private thoughts to public stories — one Publish away.*

<p align="center">
  <img src="docs/screenshots/write.png" alt="Write Article Page" width="720">
</p>

A full Markdown editor set against a dreamy purple twilight sky. Toolbar supports rich formatting plus Celeste-specific tools: **Madeline** (insert character refs), **润色/Polish** (AI refinement), **生成文章/Generate** (AI article generation).

## 🪶 Golden Feather System

<p align="center">
  < img src="docs/screenshots/feather-game.png" alt="Golden Feather" width="720">
</p >

A dual-core healing module inspired by *Celeste*: **Reflective Journaling** + **Anxiety Relief**.

*   **📝 Reflective Journaling**: Write scattered thoughts freely. Madeline listens warmly to untangle your mind.
*   **🌬️ Anxiety Relief**: Follow the physics-based falling feather to breathe deeply and cool down when anxiety hits.

**🎯 Workflow**: `Awareness (Write)` ➔ `Relief (Breathe)` ➔ `Reward (Get Feather)` ➔ `Restart`

*Let every reflection be heard, and every anxiety find an exit.*
---

## 🚀 Quick Start

### Prerequisites

- **Java 17+** (JDK 17 LTS recommended)
- **Maven 3.6+**
- **MySQL 5.7+ / 8.0**
- **Redis 6+** (for caching & token storage)
- **SiliconFlow API Key** (for GLM-4 & bge-m3)
- **Node.js 18+** (optional, for frontend dev server)

### 1. Clone & Configure

```bash
git clone <repository-url>
cd blog

# Create database
mysql -u root -p -e "CREATE DATABASE blog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 2. Environment Variables (Required for Production)

Create `.env` or export in shell:

```bash
# === Security (MUST CHANGE IN PROD) ===
export JWT_SECRET="$(openssl rand -base64 48)"        # ≥32 chars, keep secret!
export MYSQL_PASSWORD="your_strong_db_password"
export REDIS_PASSWORD="your_redis_password"

# === External Services ===
export QINIU_ACCESS_KEY="your_qiniu_ak"
export QINIU_SECRET_KEY="your_qiniu_sk"
export AI_API_KEY="your_siliconflow_api_key"
export AI_BASE_URL="https://api.siliconflow.cn/v1"
export AI_MODEL="THUDM/GLM-4-9B-0414"
export AI_EMBEDDING_MODEL="BAAI/bge-m3"

# === Database (if not localhost) ===
export MYSQL_HOST="your_mysql_host"
export MYSQL_PORT="3306"
export MYSQL_USERNAME="root"
export REDIS_HOST="your_redis_host"
export REDIS_PORT="6379"
```

> **Development**: `application.properties` has defaults; only `JWT_SECRET` is mandatory to override.

### 3. Build & Run Backend

```bash
# From project root
mvn clean install -DskipTests

# Run API module (port 8888)
cd blog-api
mvn spring-boot:run -Dspring-boot.run.profiles=dev
# Or: java -jar target/blog-api-1.0-SNAPSHOT.jar --spring.profiles.active=prod
```

### 4. Run Admin (Optional)

```bash
cd ../blog-admin
mvn spring-boot:run -Dspring-boot.run.profiles=dev
# Port 8889
```

### 5. Serve Frontend

```bash
cd ../blog-ui

# Option A: Python (simplest)
python3 -m http.server 8080

# Option B: Node.js
npx serve .

# Option C: VS Code Live Server / IntelliJ built-in
# Just open index.html directly (CORS may need backend config)
```

### 6. Access

| Page | URL |
|------|-----|
| Blog Home | http://localhost:8080/index.html |
| Diary | http://localhost:8080/diary.html |
| Write | http://localhost:8080/write.html |
| Bookshelf | http://localhost:8080/shelf.html |
| Shop (Oshiro) | http://localhost:8080/shop.html |
| My Space | http://localhost:8080/me.html |
| Archives | http://localhost:8080/archives.html |
| Login | http://localhost:8080/login.html |
| Admin Panel | http://localhost:8889/login.html |
| Actuator Health | http://localhost:8888/actuator/health |
| Prometheus Metrics | http://localhost:8888/actuator/prometheus |

---

## 🔧 Configuration Deep-Dive

### Core Config (`blog-api/src/main/resources/application.properties`)

```properties
# Server
server.port=8888
spring.application.name=mszlu_blog
spring.profiles.active=dev

# Database
spring.datasource.url=jdbc:mysql://localhost:3306/blog?useUnicode=true&characterEncoding=UTF-8&serverTimeZone=UTC
spring.datasource.username=root
spring.datasource.password=${MYSQL_PASSWORD:your_password}
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

# MyBatis-Plus
mybatis-plus.configuration.log-impl=org.apache.ibatis.logging.stdout.StdOutImpl
mybatis-plus.global-config.db-config.table-prefix=ms_
mybatis-plus.mapper-locations=classpath*:com/mszlu/blog/dao/mapper/**/*.xml

# Upload limits
spring.servlet.multipart.max-request-size=20MB
spring.servlet.multipart.max-file-size=8MB

# Qiniu Cloud Storage
qiniu.accessKey=${QINIU_ACCESS_KEY:your-access-key}
qiniu.accessSecretKey=${QINIU_ACCESS_SECRET_KEY:your-secret-key}

# AI (SiliconFlow)
ai.base-url=${AI_BASE_URL:https://api.siliconflow.cn/v1}
ai.api-key=${AI_API_KEY:your-api-key}
ai.model=${AI_MODEL:THUDM/GLM-4-9B-0414}
ai.embedding-model=${AI_EMBEDDING_MODEL:BAAI/bge-m3}

# JWT (env-configurable)
jwt.secret=${JWT_SECRET:123456Mszlu!@###$$}
jwt.expiration=2592000000

# Actuator & Prometheus
management.endpoints.web.exposure.include=health,info,prometheus,metrics
management.endpoint.health.show-details=always
management.prometheus.metrics.export.enabled=true
```

### Production Config (`blog-api/src/main/resources/application-prod.yml`)

Key production hardening:

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      idle-timeout: 300000
      max-lifetime: 1200000
      connection-timeout: 30000
  redis:
    lettuce:
      pool:
        max-active: 20
        max-idle: 10
        min-idle: 2

# Security headers
server:
  headers:
    x-content-type-options: nosniff
    x-frame-options: DENY
    x-xss-protection: "1; mode=block"

# Disable Swagger in prod
springdoc:
  api-docs:
    enabled: false
  swagger-ui:
    enabled: false

# Structured logging
logging:
  level:
    root: INFO
    com.mszlu.blog: INFO
  pattern:
    console: "%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n"
  file:
    name: logs/blog-api.log
    max-size: 100MB
    max-history: 30
```

---

## 🎯 Core Features Explained

### 1. AI Companionship System

**Madeline** (GLM-4) — Warm, sincere, delicate personality:
- **Real-time chat** with streaming responses
- **Emotion analysis**: 7 valid states (default, cute, anxious, unhappy, surprised, resentful, speechless)
- **Proactive care**: Daily 9:30 AM check-in messages via `ThreadService` + cron
- **JSON mode**: Structured output `{reply, emotion, suggestions[]}` for UI integration

**Oshiro** (Tsundere innkeeper) — Shop page exclusive:
- Unique prompt in `PromptBuilder.oshiroChat`
- Strawberry economy interactions

**RAG Memory** (bge-m3 embeddings):
- `MemoryServiceImpl.searchContext()` — Semantic search over diary history
- `ContextChunk{source, text, label, relevanceScore}` augmenting prompts
- Lazy-fill monthly snapshots via `snapReflect()`

### 2. Diary & Blog Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Write      │────►│  Diary      │────►│  Publish    │
│  (Private)  │     │  (Saved)    │     │  (Public)   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                    ┌──────▼──────┐       ┌──────▼──────┐
                    │  AI Feedback│       │  Blog Feed  │
                    │  + Emotion  │       │  + Comments │
                    └─────────────┘       └─────────────┘
```

- **Diary**: Rich text, auto-save, emotion tagging, AI feedback during writing
- **Blog**: Markdown editor, categories, tags, cover images, SEO-friendly URLs
- **One-click publish**: Select diary entries → transform → blog post

### 3. Memory & Review System

| Feature | Trigger | Output |
|---------|---------|--------|
| Daily Postcard | 1+ entries/day | AI-generated visual postcard with stamp |
| Monthly Snapshot | ≥3 entries/7d OR ≥8 entries/30d | Madeline reflection + emotion timeline |
| Bookshelf View | On-demand | Card gallery of snapshots, exportable |

### 4. Interactive Elements

- **Feather Breathing Game**: Physics-based (gravity, wind, collision), precision landing scoring, `feather-landed` custom event
- **Strawberry Economy**: Earn 🍓 by writing, spend in Oshiro's shop for themes/decorations
- **Pixel Avatars**: 8-direction Madeline sprite with spatial audio

### 5. Security Hardening (Recently Added)

| Area | Implementation |
|------|----------------|
| **Password Storage** | BCrypt (via Spring Security's `BCryptPasswordEncoder`) |
| **JWT Secret** | Externalized to `JWT_SECRET` env var, supports rotation |
| **Token Expiry** | 30 days (configurable via `jwt.expiration`) |
| **Thread Pool** | Bounded queue (1000), `CallerRunsPolicy` rejection handler |
| **File Upload** | Extension + MIME type + Magic number validation (PNG/JPEG/GIF/WEBP) |
| **Dependencies** | Fastjson 1.2.101 (CVE fixes), MyBatis-Plus unified |
| **Observability** | Actuator health/info/prometheus, Prometheus metrics export |

---

## 📚 Technical Deep-Dive

### Backend Service Layer

| Service | Key Responsibilities |
|---------|---------------------|
| `DiaryServiceImpl` | Diary CRUD, blog publishing, AI companion, summaries, snapshots, postcards, proactive bubbles |
| `ChatServiceImpl` | Main AI chat handler, JSON response parsing, emotion validation |
| `MemoryServiceImpl` | RAG: memory extraction, embedding, semantic search, context chunks |
| `LoginServiceImpl` | Auth: BCrypt verify, JWT issue, Redis token store, register |
| `ThreadService` | Async view-count updates (CAS retry), proactive message scheduling |
| `ArticleService` | Blog article CRUD, hot/new/archive lists, view counts |
| `CategoryService` / `TagService` | Taxonomy management |

### Frontend Architecture

```
blog-ui/
├── index.html          → Blog feed (category filter, search, popular, tags)
├── diary.html          → Postcard viewer + Madeline chat (2400-line diary.js)
├── write.html          → Markdown editor + AI toolbar (Polish, Generate, Madeline)
├── shelf.html          → Bookshelf snapshots (grid, modal, export)
├── shop.html           → Oshiro Inn (dialogue, strawberry shop)
├── me.html             → Profile, stats, collection, settings
├── article.html        → Blog article detail (content, comments, likes)
├── archives.html       → Chronological archive
└── login/register.html → Auth pages (JWT token → localStorage)
```

**Key JS Modules**:
- `api.js` — Centralized fetch wrapper with auth interceptors, strawberry balance
- `diary.js` — Immersive typewriter, streaming AI, emotion UI, autosave, feather game integration
- `write-madeline.js` — 8-pose pixel avatar, resource optimizer, spatial audio
- `feather-game.js` — Physics engine, difficulty scaling, event system

---

## 🧪 Testing & Quality

### Current State
- Unit tests: Minimal (placeholder `spring-boot-starter-test` only)
- Integration tests: None
- Static analysis: None configured

### Recommended Additions

```xml
<!-- Add to parent pom.xml <dependencyManagement> -->
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>testcontainers-bom</artifactId>
    <version>1.19.0</version>
    <type>pom</type>
    <scope>import</scope>
</dependency>

<!-- Add to blog-api/pom.xml -->
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>junit-jupiter</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>mysql</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>redis</artifactId>
    <scope>test</scope>
</dependency>
```

### CI/CD Pipeline (Suggested)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env: { MYSQL_ROOT_PASSWORD: test, MYSQL_DATABASE: blog }
        ports: [3306:3306]
        options: --health-cmd="mysqladmin ping" --health-interval=10s
      redis:
        image: redis:7-alpine
        ports: [6379:6379]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: 'temurin', java-version: '17' }
      - name: Cache Maven
        uses: actions/cache@v4
        with: { path: ~/.m2, key: maven-${{ hashFiles('**/pom.xml') }} }
      - run: mvn clean verify -B
      - name: SonarQube Scan
        uses: SonarSource/sonarqube-scan-action@v2
        env: { SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }} }
```

---

## 📦 Deployment Guide

### Docker Compose (Recommended for Prod)

```yaml
# docker-compose.yml (place at project root)
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: blog
      MYSQL_ROOT_PASSWORD: ${MYSQL_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

  blog-api:
    build: ./blog-api
    ports: ["8888:8888"]
    environment:
      SPRING_PROFILES_ACTIVE: prod
      MYSQL_HOST: mysql
      REDIS_HOST: redis
      JWT_SECRET: ${JWT_SECRET}
      QINIU_ACCESS_KEY: ${QINIU_ACCESS_KEY}
      QINIU_SECRET_KEY: ${QINIU_SECRET_KEY}
      AI_API_KEY: ${AI_API_KEY}
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  blog-admin:
    build: ./blog-admin
    ports: ["8889:8889"]
    environment:
      SPRING_PROFILES_ACTIVE: prod
      MYSQL_HOST: mysql
    depends_on:
      mysql:
        condition: service_healthy
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./blog-ui:/usr/share/nginx/html:ro
    depends_on: [blog-api, blog-admin]
    restart: unless-stopped

volumes:
  mysql_data:
  redis_data:
```

**Nginx Config** (serves frontend + reverse proxies API):
```nginx
# nginx.conf
events { worker_connections 1024; }
http {
  upstream api { server blog-api:8888; }
  upstream admin { server blog-admin:8889; }

  server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
  }

  server {
    listen 443 ssl http2;
    server_name your-domain.com;
    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    # Frontend
    location / {
      root /usr/share/nginx/html;
      try_files $uri $uri/ /index.html;
    }

    # API
    location /api/ {
      proxy_pass http://api;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Admin
    location /admin/ {
      proxy_pass http://admin;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }

    # Actuator (internal only)
    location /actuator/ {
      allow 10.0.0.0/8;  # VPC CIDR
      deny all;
      proxy_pass http://api;
    }
  }
}
```

### Kubernetes (Helm) — Sketch

```yaml
# helm/values.yaml (key configs)
blog-api:
  replicaCount: 3
  resources:
    limits: { cpu: "1000m", memory: "1Gi" }
    requests: { cpu: "500m", memory: "512Mi" }
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilization: 70
  env:
    - name: JWT_SECRET
      valueFrom: { secretKeyRef: { name: blog-secrets, key: jwt-secret } }
    - name: MYSQL_PASSWORD
      valueFrom: { secretKeyRef: { name: blog-secrets, key: mysql-password } }
  # ...redis, qiniu, ai keys similarly from secrets

blog-admin:
  replicaCount: 2
  # ... similar

nginx:
  replicaCount: 2
  # TLS via cert-manager + Let's Encrypt
```

---

## 🤝 Contribution Guide

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

### Quick Contribution Flow

```bash
# 1. Fork & clone
git clone https://github.com/your-username/blog.git
cd blog

# 2. Create feature branch
git checkout -b feature/your-feature-name

# 3. Make changes (follow coding standards below)
# 4. Test locally
mvn clean test -pl blog-api,blog-admin

# 5. Commit with conventional message
git commit -m "feat(diary): add emotion trend chart to monthly snapshot"

# 6. Push & PR
git push origin feature/your-feature-name
# Open PR against main branch
```

### Coding Standards (Iron Laws from AI Handover)

1. **Verify Before Trust** — After any fix, re-read the file to confirm actual state
2. **No Placeholder Comments** — Never write `// ... existing code ...` in real files
3. **Complete Replacement** — When replacing functions, ensure old code is fully removed
4. **JS Modification Standard** — Provide complete code block + precise line numbers; check JS refs before deleting HTML elements
5. **Fonts** — All text: **Renogare + CelesteZH**; only `#gameDialogName` uses Press Start 2P
6. **Asset Paths** — `celeste-sounds/madeline/...` includes `madeline/` layer
7. **GIF/Pixel Art** — No canvas scanning for size; use fixed pixel values
8. **Commit Messages** — Conventional Commits: `type(scope): description`

### Code Quality Gates (CI)

| Check | Tool | Threshold |
|-------|------|-----------|
| Compile | Maven | Zero errors |
| Unit Tests | JUnit 5 | ≥ 70% coverage (target) |
| Integration Tests | Testcontainers | All pass |
| Static Analysis | SpotBugs + Checkstyle | Zero critical/high |
| Dependency Scan | OWASP Dependency-Check | Zero CVE ≥ High |
| SonarQube | SonarCloud | Quality Gate pass |

---

## ❓ FAQ & Troubleshooting

### General

| Question | Answer |
|----------|--------|
| **What is this project?** | Immersive AI diary + blog platform with Celeste theme |
| **Do I need coding skills to use?** | No — end-user ready; coding only for dev/customization |
| **Mobile support?** | Responsive, but optimized for desktop/tablet |
| **AI Models?** | GLM-4 (chat), bge-m3 (embeddings) via SiliconFlow |
| **Data privacy?** | MySQL storage; prod requires encryption, backups, access control |
| **Own AI key?** | Yes — set `AI_API_KEY` env var |

### Common Issues

| Symptom | Diagnosis Steps |
|---------|-----------------|
| Frontend feature not working | 1. Re-read file to confirm changes  2. Clear browser cache  3. Check console errors |
| Backend 404 | 1. Is port 8888 running?  2. Check `spring.servlet.context-path` |
| Compile "cannot find symbol" | 1. Check import path (e.g. `UserThreadLocal` in `utils` pkg) |
| Constructor mismatch | 1. `@AllArgsConstructor` field order = param order |
| Audio 404 | 1. Path missing `madeline/` layer (`celeste-sounds/madeline/...`) |
| Emotion display broken | 1. AI response must be one of 7 valid values (else falls back to `default`) |
| `diarySaveCount` weird | 1. Check `localStorage` diary count logic |
| Feather game unresponsive | 1. Browser console for JS errors |
| Postcard generation fails | 1. Backend running?  2. Check logs for AI API errors |
| Prometheus empty | 1. `management.prometheus.metrics.export.enabled=true`  2. `/actuator/prometheus` accessible? |

### Detailed Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for exhaustive guide.

---

## 📈 Roadmap

### Near Term (v1.1)
- [ ] Monthly snapshot lazy-fill verification + backend restart resilience
- [ ] Address AI handover doc §6 legacy items
- [ ] Unit test coverage ≥ 50% (Service layer priority)
- [ ] Integration tests with Testcontainers (MySQL + Redis)

### Mid Term (v1.2)
- [ ] Performance optimization: query + render for large datasets
- [ ] Enhanced diary→blog workflow (batch publish, scheduling)
- [ ] Blog features: comments, tags, categories, RSS/Atom feed
- [ ] More AI interaction scenarios (prompt templates, few-shot)

### Long Term (v2.0)
- [ ] Microservice split: Gateway + Auth + Content + Interaction + Admin
- [ ] Community features: lightweight social for blog readers (preserving diary privacy)
- [ ] Multi-modal AI: image understanding (diary illustrations), voice synthesis
- [ ] Mobile app (React Native / Flutter) with offline-first sync

---

## 📄 Related Documents

| Document | Purpose |
|----------|---------|
| [如何在浏览器访问.md](如何在浏览器访问.md) | Frontend access instructions |
| [blog-ui/AI交接文档.md](blog-ui/AI交接文档.md) | Detailed dev handover (Aug 2026) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Exhaustive troubleshooting |
| [LICENSE](LICENSE) | MIT License |

---

## 👥 Contributors

- Initial development team
- AI handover document maintainers (2026-08-30)
- **You!** — [Contribute your code](CONTRIBUTING.md)!

---

> **⚠️ Production Readiness Note**: This is an educational/demonstration project. Before production deployment, complete:
> - Security assessment (penetration test, dependency scan)
> - Data protection (encryption at rest/in transit, GDPR/PIPL compliance)
> - Load testing (target: 1000 concurrent users, p99 < 500ms)
> - Disaster recovery (backup/restore RTO < 1h, RPO < 5min)
> - Observability stack deployment (Prometheus + Grafana + Loki + Tempo)

> **Celeste AI Diary Companion Blog** — *Let every word have warmth, let every day have meaning.*

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [Celeste](https://celestegame.com/) — Inspiring art, characters, and music
- [SiliconFlow](https://siliconflow.cn/) — GLM-4 & bge-m3 model access
- [MyBatis-Plus](https://baomidou.com/) — Elegant database operations
- [Spring Boot](https://spring.io/projects/spring-boot) — Productivity framework
- All contributors who shaped this project
