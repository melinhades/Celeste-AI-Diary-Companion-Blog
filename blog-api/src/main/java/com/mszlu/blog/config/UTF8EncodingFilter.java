package com.mszlu.blog.config;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.StringReader;
import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ReadListener;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletRequestWrapper;
import javax.servlet.ServletInputStream;
import java.nio.charset.StandardCharsets;

/**
 * UTF-8 编码过滤器，用于处理客户端可能发送的非法 UTF-8 字节序列
 * 将非法 UTF-8 字节替换为 Unicode 替换字符 (U+FFFD)
 */
public class UTF8EncodingFilter implements Filter {

    @Override
    public void init(FilterConfig filterConfig) throws ServletException {
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        // 只处理 application/json 类型的请求
        String contentType = httpRequest.getContentType();
        if (contentType != null && contentType.contains("application/json")) {
            chain.doFilter(new UTF8RequestWrapper(httpRequest), response);
        } else {
            chain.doFilter(request, response);
        }
    }

    @Override
    public void destroy() {
    }

    private static class UTF8RequestWrapper extends HttpServletRequestWrapper {
        private byte[] body;

        public UTF8RequestWrapper(HttpServletRequest request) throws IOException {
            super(request);
            // 读取原始请求体字节
            byte[] originalBytes = getBodyBytes(request);
            // 将字节解码为字符串，使用 UTF-8 并替换非法字符
            String bodyString = new String(originalBytes, StandardCharsets.UTF_8);
            // 重新编码为有效的 UTF-8 字节
            this.body = bodyString.getBytes(StandardCharsets.UTF_8);
        }

        private byte[] getBodyBytes(HttpServletRequest request) throws IOException {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int bytesRead;
            var inputStream = request.getInputStream();
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                baos.write(buffer, 0, bytesRead);
            }
            return baos.toByteArray();
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            final ByteArrayInputStream bais = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override
                public boolean isFinished() {
                    return bais.available() == 0;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener readListener) {
                }

                @Override
                public int read() throws IOException {
                    return bais.read();
                }
            };
        }

        @Override
        public BufferedReader getReader() throws IOException {
            // 使用已经转换为有效 UTF-8 的字节创建读取器
            String bodyString = new String(body, StandardCharsets.UTF_8);
            return new BufferedReader(new StringReader(bodyString));
        }

        @Override
        public String getContentType() {
            return super.getContentType();
        }

        @Override
        public int getContentLength() {
            return body.length;
        }

        @Override
        public long getContentLengthLong() {
            return body.length;
        }
    }
}