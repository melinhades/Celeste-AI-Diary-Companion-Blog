package com.mszlu.blog.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * 启动时做最小化的向前兼容建表/补列：
 * - ms_upload_image：图片持久化表（线上容器磁盘不可持久）
 * - ms_notification：评论/点赞消息表（匿名评论需要靠它携带匿名标记）
 * - 实体新增但历史库里没有的列：MyBatis-Plus 的 selectById/selectList 会显式列出实体全部字段，
 *   少一列就是 "Unknown column" 异常，接口表现为「系统异常」，所以必须逐列补齐
 * 只用 CREATE TABLE IF NOT EXISTS + information_schema 判断，重复启动幂等；
 * 单项失败只记日志不中断，避免某张表在某个环境不存在时把后面的补列全部带崩。
 */
@Slf4j
@Component
public class SchemaInitializer implements ApplicationRunner {

    private static final String CREATE_UPLOAD_IMAGE = "CREATE TABLE IF NOT EXISTS ms_upload_image (" +
            "id varchar(64) NOT NULL," +
            "content_type varchar(64) DEFAULT NULL," +
            "data longblob," +
            "create_date bigint DEFAULT NULL," +
            "PRIMARY KEY (id)" +
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    private static final String CREATE_NOTIFICATION = "CREATE TABLE IF NOT EXISTS ms_notification (" +
            "id bigint NOT NULL AUTO_INCREMENT," +
            "user_id varchar(64) NOT NULL," +
            "from_user_id varchar(64) DEFAULT NULL," +
            "article_id varchar(64) DEFAULT NULL," +
            "type varchar(32) DEFAULT NULL," +
            "is_read tinyint DEFAULT 0," +
            "create_date bigint DEFAULT NULL," +
            "PRIMARY KEY (id)," +
            "KEY idx_user_read (user_id, is_read)" +
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    /**
     * 心之水晶每日一颗：唯一键 (user_id, crystal_date) 承担服务端幂等。
     * crystal_date 是服务器时区的自然日字符串（yyyy-MM-dd），不是时间戳。
     */
    private static final String CREATE_HEART_CRYSTAL = "CREATE TABLE IF NOT EXISTS ms_heart_crystal (" +
            "id varchar(64) NOT NULL," +
            "user_id varchar(64) NOT NULL," +
            "crystal_date varchar(10) NOT NULL," +
            "color varchar(16) DEFAULT NULL," +
            "title varchar(64) DEFAULT NULL," +
            "description varchar(128) DEFAULT NULL," +
            "create_date bigint DEFAULT NULL," +
            "PRIMARY KEY (id)," +
            "UNIQUE KEY uk_user_date (user_id, crystal_date)" +
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    /** {表名, 列名, 列定义}；列定义与开发库保持一致，存量行按默认值回填 */
    private static final String[][] EXPECTED_COLUMNS = {
            {"ms_article", "anonymous", "TINYINT NOT NULL DEFAULT 0"},
            {"ms_comment", "anonymous", "TINYINT NOT NULL DEFAULT 0"},
            {"ms_article", "visibility", "TINYINT NOT NULL DEFAULT 1"},
            {"ms_article", "source_type", "VARCHAR(16) DEFAULT NULL"},
            {"ms_article", "source_id", "VARCHAR(64) DEFAULT NULL"},
            // 首次公开时间：存量行的回填只在 migration-article-publish-time.sql 里做，这里至少保证列存在，不让查询报 Unknown column
            {"ms_article", "publish_time", "BIGINT DEFAULT NULL"},
            {"ms_sys_user", "berry", "INT NOT NULL DEFAULT 0"},
            {"ms_sys_user", "signature", "VARCHAR(255) DEFAULT NULL"},
            {"ms_sys_user", "api_key", "VARCHAR(128) DEFAULT NULL"},
            {"ms_sys_user", "api_provider", "VARCHAR(20) DEFAULT NULL"},
            {"ms_diary", "type", "VARCHAR(16) NOT NULL DEFAULT 'day'"},
            {"ms_notification", "anonymous", "TINYINT NOT NULL DEFAULT 0"},
    };

    @Autowired
    private DataSource dataSource;

    @Override
    public void run(ApplicationArguments args) {
        try (Connection conn = dataSource.getConnection()) {
            try (Statement st = conn.createStatement()) {
                st.execute(CREATE_UPLOAD_IMAGE);
                st.execute(CREATE_NOTIFICATION);
                st.execute(CREATE_HEART_CRYSTAL);
            } catch (Exception e) {
                log.error("ms_upload_image / ms_notification / ms_heart_crystal 建表失败（图片读取、消息列表与心之水晶会受影响，请手动建表）", e);
            }
            for (String[] expected : EXPECTED_COLUMNS) {
                if (ensureColumn(conn, expected[0], expected[1], expected[2]) && "publish_time".equals(expected[1])) {
                    backfillPublishTime(conn);
                }
            }
        } catch (Exception e) {
            log.error("数据库结构初始化中断，请检查数据源连接", e);
        }
    }

    private boolean ensureColumn(Connection conn, String table, String column, String definition) {
        try {
            if (!hasTable(conn, table)) {
                log.warn("表 {} 在当前环境不存在，跳过列 {} 的补齐", table, column);
                return false;
            }
            if (hasColumn(conn, table, column)) return false;
            try (Statement st = conn.createStatement()) {
                st.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
            }
            log.info("已为 {} 补充列 {}（{}）", table, column, definition);
            return true;
        } catch (Exception e) {
            // 不阻断启动，也不影响其余补列；但缺列会导致 MyBatis 查询报错，必须打出明显日志便于排查
            log.error("补列失败：{}.{}，请手动执行 ALTER TABLE {} ADD COLUMN {} {}",
                    table, column, table, column, definition, e);
            return false;
        }
    }

    /**
     * publish_time 刚刚建出来时的一次性回填：存量公开文章没有「先私密再公开」的过程，
     * 它们的公开时刻就是创建时刻。只碰 NULL 行，所以幂等；新发的文章由代码直接写入真实时间。
     */
    private void backfillPublishTime(Connection conn) {
        try (Statement st = conn.createStatement()) {
            int rows = st.executeUpdate("UPDATE ms_article SET publish_time = create_date "
                    + "WHERE visibility = 1 AND publish_time IS NULL");
            log.info("ms_article.publish_time 回填完成，影响 {} 行", rows);
        } catch (Exception e) {
            // 缺公开时间只影响详情页的展示，不值得让整个启动流程失败
            log.warn("ms_article.publish_time 回填失败，可手动执行 migration-article-publish-time.sql", e);
        }
    }

    private boolean hasTable(Connection conn, String table) throws SQLException {
        try (ResultSet rs = conn.getMetaData().getTables(conn.getCatalog(), null, table, null)) {
            return rs.next();
        }
    }

    private boolean hasColumn(Connection conn, String table, String column) throws SQLException {
        try (ResultSet rs = conn.getMetaData().getColumns(conn.getCatalog(), null, table, column)) {
            return rs.next();
        }
    }
}
