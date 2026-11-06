package com.mszlu.blog.utils;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.IOException;
import java.net.URI;

/**
 * Cloudflare R2 图片存储（S3 兼容协议）。
 * <p>
 * 设计要点：
 * - 默认关闭（r2.enabled=false），关闭或配置不完整时自动回退到数据库存储，本地开发零依赖；
 * - R2 只需私有 bucket，读取由后端代理（{@link com.mszlu.blog.controller.ImageController}），
 *   因此无需开启 public bucket / 绑定自定义域名，前端 URL 仍统一为 /images/{id}；
 * - path-style 访问是 R2 的硬性要求，region 固定 "auto"。
 */
@Component
@Slf4j
public class R2Utils {

    @Value("${r2.enabled:false}")
    private boolean enabled;
    @Value("${r2.endpoint:}")
    private String endpoint;
    @Value("${r2.bucket:}")
    private String bucket;
    @Value("${r2.access-key-id:}")
    private String accessKeyId;
    @Value("${r2.secret-access-key:}")
    private String secretAccessKey;
    @Value("${r2.region:auto}")
    private String region;
    @Value("${r2.key-prefix:images/}")
    private String keyPrefix;

    private S3Client client;

    @PostConstruct
    public void init() {
        if (!enabled) {
            log.info("R2 未启用，图片将存数据库");
            return;
        }
        if (StringUtils.isAnyBlank(endpoint, bucket, accessKeyId, secretAccessKey)) {
            log.warn("R2 已启用但配置不完整（endpoint/bucket/access-key/secret 缺一不可），回退数据库存储");
            enabled = false;
            return;
        }
        client = S3Client.builder()
                .endpointOverride(URI.create(endpoint))
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(accessKeyId, secretAccessKey)))
                // R2 必须 path-style（bucket 在路径里，不是子域名）
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build();
        log.info("R2 图片存储已启用，bucket={} endpoint={}", bucket, endpoint);
    }

    /** R2 是否可用（已启用且客户端就绪）。 */
    public boolean isEnabled() {
        return enabled && client != null;
    }

    /**
     * 写入对象。成功返回 true；失败返回 false（调用方据此回退数据库）。
     */
    public boolean put(String id, String contentType, byte[] data) {
        if (!isEnabled()) {
            return false;
        }
        try {
            client.putObject(
                    PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(keyOf(id))
                            .contentType(contentType)
                            .build(),
                    RequestBody.fromBytes(data));
            return true;
        } catch (Exception e) {
            log.error("R2 写入失败，id={} key={}", id, keyOf(id), e);
            return false;
        }
    }

    /**
     * 读取对象。不存在返回 null；其它异常记日志后返回 null（调用方据此回退数据库）。
     */
    public Stored get(String id) {
        if (!isEnabled()) {
            return null;
        }
        try (ResponseInputStream<GetObjectResponse> in = client.getObject(
                GetObjectRequest.builder().bucket(bucket).key(keyOf(id)).build())) {
            return new Stored(in.readAllBytes(), in.response().contentType());
        } catch (NoSuchKeyException e) {
            return null;
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return null;
            }
            log.error("R2 读取失败，id={} key={}", id, keyOf(id), e);
            return null;
        } catch (IOException e) {
            log.error("R2 读取流关闭失败，id={} key={}", id, keyOf(id), e);
            return null;
        }
    }

    private String keyOf(String id) {
        return keyPrefix + id;
    }

    /**
     * R2 读取结果载体：图片字节 + 原始 Content-Type。
     * data 为一次性传输对象，不做防御性拷贝（同 vo/pojo 层的既有口径）。
     */
    public record Stored(byte[] data, String contentType) {
    }
}
