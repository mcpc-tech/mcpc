---
name: code-review
description: Code review guidelines and checklist. Use when reviewing PRs or preparing code for review.
metadata:
  author: mcpc-team
  version: "1.0"
---

# Code Review Guidelines

## Before Submitting

- [ ] Self-review your changes
- [ ] Run all tests locally
- [ ] Update documentation
- [ ] Keep PR small and focused

## Review Checklist

### Code Quality

- Clear naming conventions
- No code duplication
- Proper error handling
- Appropriate comments

### Security

- Input validation
- No hardcoded secrets
- SQL injection prevention
- XSS protection

### Performance

- No N+1 queries
- Efficient algorithms
- Proper caching

## Feedback Guidelines

- Be constructive and specific
- Explain the "why"
- Suggest alternatives
- Acknowledge good work
