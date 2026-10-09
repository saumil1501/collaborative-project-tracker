package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.CommentRequest;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CommentValidationTests {
    @Test
    void requiresNonblankTextWithAtMostTwoThousandCharacters() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertFalse(validator.validate(new CommentRequest(null)).isEmpty());
            assertFalse(validator.validate(new CommentRequest(" \n\t ")).isEmpty());
            assertFalse(validator.validate(new CommentRequest("a".repeat(2001))).isEmpty());
            assertTrue(validator.validate(new CommentRequest("a".repeat(2000))).isEmpty());
        }
    }
}
