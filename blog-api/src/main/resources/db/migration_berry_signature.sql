-- ============================================================
-- 迁移：ms_sys_user 增加草莓余额与个性签名字段
-- 日期：2026-09-25
-- 说明：新增列均可空/有默认值，老数据无需回填；
--       berry 缺省 0，signature 缺省 NULL（前端显示占位文案）。
-- ============================================================

ALTER TABLE `ms_sys_user`
    ADD COLUMN `berry` INT NOT NULL DEFAULT 0 COMMENT '草莓余额' AFTER `status`,
    ADD COLUMN `signature` VARCHAR(255) DEFAULT NULL COMMENT '个性签名' AFTER `berry`;
