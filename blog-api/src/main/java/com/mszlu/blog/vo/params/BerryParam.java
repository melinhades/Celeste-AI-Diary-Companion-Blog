package com.mszlu.blog.vo.params;

import lombok.Data;

/**
 * 草莓余额增减请求体
 */
@Data
public class BerryParam {

    /** 变化量：正数为获得（写日记/草莓籽），负数为消费（商店）；服务端保证余额不小于 0 */
    private Integer delta;
}
