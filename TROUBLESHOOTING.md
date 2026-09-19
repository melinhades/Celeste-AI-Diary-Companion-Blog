# Troubleshooting Guide

This document provides detailed solutions for common issues encountered with the Celeste AI Diary Companion Blog.

## Table of Contents
1. [Installation Issues](#installation-issues)
2. [Backend Problems](#backend-problems)
3. [Frontend Issues](#frontend-issues)
4. [AI Integration Problems](#ai-integration-problems)
5. [Database Issues](#database-issues)
6. [Performance Issues](#performance-issues)

## Installation Issues

### Java Version Not Recognized
**Problem**: System doesn't recognize Java 17 even though it's installed  
**Solution**: 
- Check your JAVA_HOME environment variable points to JDK 17
- Run `java -version` to verify the version
- On Windows, ensure you're using the JDK path, not JRE
- Restart your terminal after setting environment variables

### Maven Dependencies Not Downloading
**Problem**: Maven fails to download dependencies  
**Solution**:
- Check your internet connection
- Verify your Maven settings.xml doesn't have problematic mirrors
- Try `mvn dependency:purge-local-repository` to clear local cache
- Check if corporate firewall is blocking Maven Central

## Backend Problems

### Port 8888 Already in Use
**Problem**: Error when starting backend: "Port 8888 is already in use"  
**Solution**:
- Find what's using the port: `netstat -ano | findstr :8888` (Windows) or `lsof -i :8888` (Mac/Linux)
- Stop the conflicting service or change the port in application.yml
- Common culprits: Other development servers, Docker containers

### Database Connection Failed
**Problem**: Application fails to start with database connection errors  
**Solution**:
- Verify MySQL service is running
- Check database credentials in application.yml
- Ensure the database `blog` exists with correct character set
- Test connection manually with MySQL client
- Verify MySQL user has sufficient privileges

### AI Service Timeout
**Problem**: Backend logs show frequent timeouts to AI service  
**Solution**:
- Verify your SILICONFLOW_API_KEY is valid and has credit
- Check network connectivity to api.biminl.com
- Consider increasing timeout values in AiClient.java temporarily
- Check if your region has restricted access to the AI service

## Frontend Issues

### Blank White Screen
**Problem**: Application loads but shows only a white screen  
**Solution**:
- Open browser developer tools (F12) and check Console tab for JavaScript errors
- Clear browser cache and hard refresh (Ctrl+Shift+R)
- Check if ad-blockers are blocking essential scripts
- Try in incognito/private browsing mode to rule out extension conflicts

### Static Assets Not Loading (404 Errors)
**Problem**: Images, sounds, or styles fail to load  
**Solution**:
- Verify you're accessing files via HTTP server, not file:// protocol
- Check that the blog-ui directory is being served correctly
- Confirm file paths match actual file locations (case-sensitive on some systems)
- Ensure you haven't accidentally renamed or moved asset folders

### Responsive Design Broken
**Problem**: Layout looks wrong on mobile or different screen sizes  
**Solution**:
- Check if custom CSS overrides are interfering with responsive rules
- Verify viewport meta tag is present in HTML headers
- Test with browser's responsive design mode
- Check for fixed-width elements that don't scale properly

## AI Integration Problems

### Emotions Not Displaying Correctly
**Problem**: Emotion tags show as "default" or incorrect values  
**Solution**:
- Check backend logs for AI API responses
- Verify the AI is returning valid emotion values from the allowed set
- Check emotion mapping logic in ChatServiceImpl.java
- Ensure frontend is correctly parsing and displaying emotion values

### Slow AI Response Times
**Problem**: Noticeable delays in AI responses  
**Solution**:
- Check network latency to AI service endpoint
- Consider that free/trial tiers may have rate limiting
- Monitor backend logs for token usage and response times
- Check if conversation history is growing excessively large

### Incoherent or Repetitive AI Responses
**Problem**: AI generates nonsensical or repetitive content  
**Solution**:
- Check temperature and other AI parameters in PromptBuilder
- Verify context isn't being overloaded with too much history
- Check for bugs in conversation history truncation
- Consider implementing more sophisticated context management

## Database Issues

### Character Encoding Problems
**Problem**: Special characters or emojis appear incorrectly  
**Solution**:
- Verify database, table, and column character sets are utf8mb4
- Check connection string includes `useUnicode=true&characterEncoding=utf8`
- Ensure MySQL server/configuration supports utf8mb4
- Verify Java application is using UTF-8 encoding

### Migration Issues After Model Changes
**Problem**: Application fails after changing entity classes  
**Solution**:
- With `ddl-auto: update`, simple changes should work automatically
- For complex changes, consider manual migration scripts
- Backup data before making significant schema changes
- Check application logs for specific Hibernate error messages

## Performance Issues

### Slow Diary Loading
**Problem**: Long delays when loading diary list or individual entries  
**Solution**:
- Check database indexing on frequently queried fields
- Consider adding pagination for large diary collections
- Review frontend rendering efficiency for large datasets
- Check if AI processing is blocking UI thread

### High Memory Usage
**Problem**: Browser or server uses excessive memory  
**Solution**:
- Check for memory leaks in frontend JavaScript (especially event listeners)
- Verify backend isn't retaining unnecessary objects in session/scope
- Monitor AI context size - consider implementing context summarization
- Check for unclosed resources (streams, connections, etc.)

## Advanced Debugging

### Enabling Debug Logging
To get more detailed information for troubleshooting:

**Backend**: 
- Change `logging.level.com.mszlu.blog=debug` in application.yml
- Or set environment variable: `LOGGING_LEVEL_COM_MSZLU_BLOG=DEBUG`

**Frontend**:
- Open browser developer tools and enable verbose logging
- Check Network tab for failed requests
- Use Console.tab for JavaScript debugging

### Getting Help
If you've exhausted these troubleshooting steps:
1. Search existing GitHub issues
2. Create a new issue with:
   - Detailed problem description
   - Steps to reproduce
   - Expected vs actual behavior
   - System specifications
   - Relevant logs (with sensitive info removed)
3. Consider reaching out in community forums or discussions

Remember to always backup your data before attempting significant troubleshooting steps that might affect your diary entries!