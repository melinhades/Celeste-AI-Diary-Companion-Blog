package com.mszlu.blog.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * 启动时做最小化的向前兼容建表/补列：
 * - ms_upload_image：图片持久化表（线上容器磁盘不可持久）
 * - ms_article.anonymous / ms_comment.anonymous：匿名标记（历史数据默认 0 = 非匿名）
 * 只用 CREATE TABLE IF NOT EXISTS + information_schema 判断，重复启动幂等。
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

    @Autowired
    private DataSource dataSource;

    @Override
    public void run(ApplicationArguments args) {
        try (Connection conn = dataSource.getConnection(); Statement st = conn.createStatement()) {
            st.execute(CREATE_UPLOAD_IMAGE);
            ensureColumn(conn, st, "ms_article", "anonymous");
            ensureColumn(conn, st, "ms_comment", "anonymous");
        } catch (Exception e) {
            // 不阻断启动；但缺列会导致 MyBatis 查询报错，因此必须打出明显日志便于排查
            log.error("数据库结构初始化失败（图片表或匿名列缺失，请手动执行补列）", e);
        }
    }

    private void ensureColumn(Connection conn, Statement st, String table, String column) throws Exception {
        if (hasColumn(conn, table, column)) return;
        st.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " TINYINT NOT NULL DEFAULT 0");
        log.info("已为 {} 补充匿名标记列 {}", table, column);
    }

    private boolean hasColumn(Connection conn, String table, String column) throws Exception {
        try (ResultSet rs = conn.getMetaData().getColumns(conn.getCatalog(), null, table, column)) {
            return rs.next();
        }
    }
}
