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

    /** {表名, 列名, 列定义}；列定义与开发库保持一致，存量行按默认值回填 */
    private static final String[][] EXPECTED_COLUMNS = {
            {"ms_article", "anonymous", "TINYINT NOT NULL DEFAULT 0"},
            {"ms_comment", "anonymous", "TINYINT NOT NULL DEFAULT 0"},
            {"ms_article", "visibility", "TINYINT NOT NULL DEFAULT 1"},
            {"ms_article", "source_type", "VARCHAR(16) DEFAULT NULL"},
            {"ms_article", "source_id", "VARCHAR(64) DEFAULT NULL"},
            {"ms_sys_user", "berry", "INT NOT NULL DEFAULT 0"},
            {"ms_sys_user", "signature", "VARCHAR(255) DEFAULT NULL"},
            {"ms_sys_user", "api_key", "VARCHAR(128) DEFAULT NULL"},
            {"ms_sys_user", "api_provider", "VARCHAR(20) DEFAULT NULL"},
            {"ms_diary", "type", "VARCHAR(16) NOT NULL DEFAULT 'day'"},
    };

    @Autowired
    private DataSource dataSource;

    @Override
    public void run(ApplicationArguments args) {
        try (Connection conn = dataSource.getConnection()) {
            try (Statement st = conn.createStatement()) {
                st.execute(CREATE_UPLOAD_IMAGE);
            } catch (Exception e) {
                log.error("图片表 ms_upload_image 初始化失败（上传的图片将读取不到，请手动建表）", e);
            }
            for (String[] expected : EXPECTED_COLUMNS) {
                ensureColumn(conn, expected[0], expected[1], expected[2]);
            }
        } catch (Exception e) {
            log.error("数据库结构初始化中断，请检查数据源连接", e);
        }
    }

    private void ensureColumn(Connection conn, String table, String column, String definition) {
        try {
            if (!hasTable(conn, table)) {
                log.warn("表 {} 在当前环境不存在，跳过列 {} 的补齐", table, column);
                return;
            }
            if (hasColumn(conn, table, column)) return;
            try (Statement st = conn.createStatement()) {
                st.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
            }
            log.info("已为 {} 补充列 {}（{}）", table, column, definition);
        } catch (Exception e) {
            // 不阻断启动，也不影响其余补列；但缺列会导致 MyBatis 查询报错，必须打出明显日志便于排查
            log.error("补列失败：{}.{}，请手动执行 ALTER TABLE {} ADD COLUMN {} {}",
                    table, column, table, column, definition, e);
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
