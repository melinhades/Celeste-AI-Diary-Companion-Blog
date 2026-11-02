package com.mszlu.blog.vo.params;

import lombok.Data;

/**
 * 草莓余额消费请求体
 */
@Data
public class BerryParam {

    /** 变化量：只允许负数（消费，如商店）；正向奖励不再由客户端传入，由服务端业务发放 */
    private Integer delta;
}
