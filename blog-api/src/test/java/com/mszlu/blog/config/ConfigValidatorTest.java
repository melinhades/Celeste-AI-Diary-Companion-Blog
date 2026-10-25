package com.mszlu.blog.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ConfigValidatorTest {

    private static final String VALID_SECRET = "prod-secret-key-with-enough-bytes-32+";

    private ConfigValidator validator(MockEnvironment env) {
        return new ConfigValidator(env);
    }

    @Test
    void nonProdProfileSkipsValidation() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("dev");
        assertDoesNotThrow(() -> validator(env).run(new DefaultApplicationArguments()));
    }

    @Test
    void prodFailsFastWhenSecretMissing() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod");
        assertThrows(IllegalStateException.class,
                () -> validator(env).run(new DefaultApplicationArguments()));
    }

    @Test
    void prodFailsFastWhenSecretIsCodeDefault() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("JWT_SECRET", "123456Mszlu!@###$$");
        env.setActiveProfiles("prod");
        assertThrows(IllegalStateException.class,
                () -> validator(env).run(new DefaultApplicationArguments()));
    }

    @Test
    void prodFailsFastWhenSecretIsYmlDefault() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("JWT_SECRET", "MszluBlogJwtSecretKey2026AbcXyz789");
        env.setActiveProfiles("prod");
        assertThrows(IllegalStateException.class,
                () -> validator(env).run(new DefaultApplicationArguments()));
    }

    @Test
    void prodFailsFastWhenSecretTooShort() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("JWT_SECRET", "short-secret");
        env.setActiveProfiles("prod");
        assertThrows(IllegalStateException.class,
                () -> validator(env).run(new DefaultApplicationArguments()));
    }

    @Test
    void prodPassesWithExplicitStrongSecret() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("JWT_SECRET", VALID_SECRET);
        env.setActiveProfiles("prod");
        assertDoesNotThrow(() -> validator(env).run(new DefaultApplicationArguments()));
    }
}
