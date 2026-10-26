# Spring Boot 升级记录：2.5.0 → 2.7.18 → 3.2.6

分支：`upgrade/spring-boot-3.2.6`
提交：`aec994a`（2.7.18）、`dc724e8`（3.2.6）
构建：`& "$env:USERPROFILE\.m2\maven-dist\apache-maven-3.9.16\bin\mvn.cmd" -B clean package -DskipTests`（JDK 17.0.12，cwd 为仓库根）

## 第一步：2.5.0 → 2.7.18

改动：

- `pom.xml`：`spring-boot-starter-parent` 2.5.0 → 2.7.18。
- `pom.xml` / `blog-admin/pom.xml`：mysql 驱动坐标 `mysql:mysql-connector-java` → `com.mysql:mysql-connector-j`。Boot 2.7 起不再管理旧坐标，不改会直接构建失败。
- 未改任何 Java 代码，`javax` 保持不变。

验证结果：

- `clean package -DskipTests` BUILD SUCCESS。
- `log4j-core` 由 2.14.1 变为 **2.17.2**，Log4Shell 影响版本消除。
- blog-api 启动成功：`/actuator/health` 为 UP（db、redis 均 UP），`POST /articles` 返回真实数据。
- blog-admin 启动成功：`/login.html` 200，未登录访问 `/pages/main.html` 302 到登录页。
- 路径匹配：现有通配（`/diary/**`、`/roundtable/*/interject`、`/uploads/**` 等）在 PathPatternParser 下正常，**无需**设置 `spring.mvc.pathmatch.matching-strategy=ant_path_matcher`。
- Actuator：`management.endpoints.web.exposure.include` 与 health 明细配置在 2.7 语义下仍符合预期。

过程中遇到的问题：

- blog-api 启动报 Bean 循环引用（`webMVCConfig → loginIntercepter → loginServiceImpl ⇄ sysUserServiceImpl`），Boot 2.6 起默认禁止。处理方式是在 `application-prod.yml` 增加 `spring.main.allow-circular-references: true`（不改业务代码的最小兼容方案）。该配置实际在第二步提交中补入。

## 第二步：2.7.18 → 3.2.6

改动清单：

| 文件 | 改动 |
| --- | --- |
| `pom.xml` | parent → 3.2.6；`mybatis-plus-boot-starter 3.5.3.1` → `mybatis-plus-spring-boot3-starter 3.5.11`（dependencies 与 dependencyManagement 两处）；新增 `mybatis-plus-jsqlparser 3.5.11`；删除无用的 `javax.xml.bind:jaxb-api` 与 `org.glassfish.jaxb:jaxb-runtime` |
| `blog-admin/pom.xml` | MP 改用 boot3 starter，并引入 `mybatis-plus-jsqlparser`（版本走父级） |
| `blog-admin/.../config/SecurityConfig.java` | 重写为 Spring Security 6 形式（详见下） |
| `blog-admin/.../service/AuthService.java` | `javax.servlet` → `jakarta.servlet` |
| `blog-api` 14 个 Java 文件 + 1 个测试 | `javax.servlet` / `javax.annotation` → `jakarta.*`（含 `代理/控制器` 中的全限定名写法） |
| `application-prod.yml` | `spring.redis` 整段迁移为 `spring.data.redis`；补入 `spring.main.allow-circular-references` |

SecurityConfig 关键点：

- 删除 `extends WebSecurityConfigurerAdapter`，改为 `@Configuration` + `SecurityFilterChain` Bean + `DaoAuthenticationProvider`（仍走 `ms_admin` 表 + BCrypt）。
- `authorizeRequests()` → `authorizeHttpRequests()`，`antMatchers()` → `requestMatchers()`，`.and()` 链式改为 lambda DSL。
- `/admin/**` 的旧 SpEL `.access("@authService.auth(request,authentication)")` 改为 AuthorizationManager：`.access((authenticationSupplier, context) -> new AuthorizationDecision(authService.auth(context.getRequest(), authenticationSupplier.get())))`。
- `@EnableGlobalMethodSecurity` → `@EnableMethodSecurity`。
- 保留 `headers().frameOptions().sameOrigin()`（后台页面 iframe 依赖此配置）、csrf 关闭、`/login.html` `/login` `/pages/main.html` `/login.html?error` `/logout` `/login.html` 等路径不变。

验证结果：

- `clean package -DskipTests` BUILD SUCCESS；`mvn -B test` 22 个测试全部通过。
- `RoundtableEngineE2eTest` 依赖外部 AI 接口，环境不可用时失败，按约定单独跳过（`-Dtest=!RoundtableEngineE2eTest`），测试类保留未删除。
- 依赖树：`spring-boot 3.2.6`、`log4j-core 2.21.1`、`tomcat-embed-core 10.1.24`、`mybatis-plus-spring-boot3-starter 3.5.11`、`jsqlparser 5.1`、`spring-security-crypto 6.2.4`、`com.mysql:mysql-connector-j 8.3.0`；无 `javax.servlet-api`，无旧 mysql 坐标。
- blog-api 运行时：health 的 db/redis 均 UP（证明 `spring.data.redis` 生效）；`POST /articles` 分页返回 `total/records`（`PaginationInnerInterceptor` 生效）；`/articles/listArchives` 正常（mapper XML 加载正常）；`POST /articles/publish` 返回 90002 未登录（UTF8EncodingFilter 请求体包装 + jakarta 拦截器生效）；登录签发 JWT 后携带 `Authorization` 访问 `/articles/myCount` 返回 200（JWT + Redis `Token_*` 校验链路正常）。
- blog-admin 运行时：`/login.html` 200 且 `X-Frame-Options: SAMEORIGIN`；未登录 `/pages/main.html` 302；未登录访问 `/admin/permission/list` 被 AuthorizationManager 拒绝（302）；错误凭据 302 到 `/login.html?error`；正确凭据登录 302 到 `/pages/main.html`，带会话访问 `/pages/main.html` 200、`/admin/permission/list` 200（超管 id=1 通过自定义鉴权）；`/logout` 302 到 `/login.html`，会话失效。

## 遗留风险与技术债

- **fastjson 1.2.83** 未升级（按要求保持），该版本仍在老分支线上，后续可考虑迁移到 Jackson 或升级 fastjson2。
- **qiniu-java-sdk** 未做 Boot 3 / Jakarta 专项验证（项目仅用其上传 API，未触发 servlet 依赖）。
- **循环依赖**用 `allow-circular-references: true` 兜底，属于临时方案，长期应拆解 `loginServiceImpl ⇄ sysUserServiceImpl`。
- **HEAD 历史状态**：升级前的两个提交点本身缺少两处编译修复（`Result.success()`、`sessionId` 被 lambda 捕获），本次已在 3.2.6 提交中一并修正；`DiaryServiceImpl` 里其余本地未提交的业务改动（表情倾向提示、羽毛提示调整）未纳入升级提交，仍保留在工作区。
- 仓库根目录的手工运行脚本/文本（如 `args_app.txt`、`cp_runtime2.txt`）仍是 3.5.3.1 / javax 时代的 classpath，不影响 Maven 构建，如仍在使用需另行更新。
- 本地数据库缺少 `ms_reminder` 表，定时任务会周期性打印 SQL 告警，与本次升级无关。
- 本地 `ms_admin` 备份库中的密码本身是占位哈希；登录验证是通过临时替换哈希后恢复完成的，不影响代码结论。
