-- P3.3 情绪状态持久化表
CREATE TABLE IF NOT EXISTS ms_emotion_state (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL COMMENT '用户 ID',
    emotion VARCHAR(32) NOT NULL DEFAULT '默认' COMMENT '当前情绪：默认/不安/惊讶/怨恨/不开心/可爱/无语',
    intensity INT DEFAULT 5 COMMENT '情绪强度 1-10',
    trigger_diary_id VARCHAR(64) COMMENT '触发这个情绪的日记 ID',
    update_time BIGINT NOT NULL COMMENT '更新时间戳',
    UNIQUE KEY uk_user (user_id),
    INDEX idx_update_time (update_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Madeline 情绪状态表（跨会话持久化）';
