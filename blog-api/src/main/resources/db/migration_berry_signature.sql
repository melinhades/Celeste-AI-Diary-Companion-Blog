-- ============================================================
-- 迁移：ms_sys_user 增加草莓余额与个性签名字段
-- 日期：2026-09-25
-- 说明：新增列均可空/有默认值，老数据无需回填；
--       berry 缺省 0，signature 缺省 NULL（前端显示占位文案）。
-- ============================================================

-- 注意：TiDB 不支持在同一条 ALTER 中引用本语句新增的列，
--       因此 berry / signature 必须拆成两条独立执行（合并写法会报 Unknown column 'berry'）。

ALTER TABLE `ms_sys_user`
    ADD COLUMN `berry` INT NOT NULL DEFAULT 0 COMMENT '草莓余额' AFTER `status`;

ALTER TABLE `ms_sys_user`
    ADD COLUMN `signature` VARCHAR(255) DEFAULT NULL COMMENT '个性签名' AFTER `berry`;
