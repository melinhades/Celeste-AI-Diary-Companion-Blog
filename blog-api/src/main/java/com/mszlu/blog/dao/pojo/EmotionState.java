package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

@Data
public class EmotionState {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String userId;

    /** 默认/不安/惊讶/怨恨/不开心/可爱/无语 */
    private String emotion;

    /** 1-10 */
    private Integer intensity;

    /** 触发这个情绪的日记 ID */
    private String triggerDiaryId;

    private Long updateTime;
}
