# ==================== 构建阶段 ====================
# 容器内自己跑 mvn package，仓库里只留源码，不再依赖提交 target/*.jar
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build

# 先只拷 pom，利用 Docker 层缓存：pom 不变时，依赖下载这层直接命中，不用重复拉
COPY pom.xml .
COPY blog-api/pom.xml blog-api/
COPY blog-admin/pom.xml blog-admin/
RUN mvn -B -q dependency:go-offline

# 再拷源码，真正打包
COPY blog-api/src blog-api/src
COPY blog-admin/src blog-admin/src
RUN mvn -B clean package -DskipTests

# ==================== 运行阶段 ====================
# 轻量级 Java 17 运行环境（Alpine 体积最小）
FROM eclipse-temurin:17-jre-alpine

# 设置时区为上海，保证日志和定时任务时间正确
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# 从构建阶段拿 jar（target/ 在 .gitignore 里也没关系，它只存在于构建容器内）
COPY --from=build /build/blog-api/target/*.jar app.jar

# 限制 JVM 内存！Render 免费版只有 512MB，不限制一定会 OOM 崩溃
ENV JAVA_OPTS="-Xms128m -Xmx256m -XX:MaxRAMPercentage=70"

# 云端强制使用 prod 配置：
# application.properties 默认 active=dev，但 application-dev.properties 被 .gitignore 挡住，
# 云端不存在该文件，不改会导致启动时找不到数据源配置而崩溃
ENV SPRING_PROFILES_ACTIVE=prod

# 暴露后端端口（README 里定义的是 8888）
EXPOSE 8888

# 启动命令
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
