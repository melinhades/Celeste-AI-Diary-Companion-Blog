# 1. 使用轻量级 Java 17 运行环境（Alpine 版体积最小）
FROM eclipse-temurin:17-jre-alpine

# 2. 设置时区为上海，保证日志和定时任务时间正确
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 3. 设置工作目录
WORKDIR /app

# 4. 复制你本地打包好的 Spring Boot JAR 包
# 注意：你需要先在本地执行 mvn clean package，然后把生成的 target/*.jar 提交到 GitHub
COPY blog-api/target/*.jar app.jar

# 5. 限制 JVM 内存！Render 免费版只有 512MB，不限制一定会 OOM 崩溃
ENV JAVA_OPTS="-Xms128m -Xmx256m -XX:MaxRAMPercentage=70"

# 6. 暴露后端端口（你的 README 里写了是 8888）
EXPOSE 8888

# 7. 启动命令
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]