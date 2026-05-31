package com.mszlu.blog.admin.utils;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class PasswordGenerator {

    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

        // 生成常用密码的加密版本
        System.out.println("=== 管理员密码生成工具 ===\n");

        String[] passwords = {"admin", "123456", "admin123", "mszlu"};

        for (String password : passwords) {
            String encoded = encoder.encode(password);
            System.out.println("原始密码: " + password);
            System.out.println("加密后: " + encoded);
            System.out.println("\nSQL插入语句:");
            System.out.println("INSERT INTO ms_admin (username, password) VALUES ('admin', '" + encoded + "');");
            System.out.println("\n" + "=".repeat(60) + "\n");
        }

        // 自定义密码示例
        System.out.println("如果需要自定义密码，修改下面的代码:");
        String customPassword = "your_password_here";
        String customEncoded = encoder.encode(customPassword);
        System.out.println("自定义密码: " + customPassword);
        System.out.println("加密后: " + customEncoded);
        System.out.println("\nSQL插入语句:");
        System.out.println("INSERT INTO ms_admin (username, password) VALUES ('admin', '" + customEncoded + "');");
    }
}
