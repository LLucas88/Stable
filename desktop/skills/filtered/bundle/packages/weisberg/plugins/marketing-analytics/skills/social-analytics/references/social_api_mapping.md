# Social Platform API Metric Mapping

Metric taxonomy across Meta, LinkedIn, TikTok, YouTube, and X platforms.

## Engagement Metrics

### Impressions

| Platform | API Field               | Endpoint                          | Notes                              |
|----------|-------------------------|-----------------------------------|------------------------------------|
| Meta     | `impressions`           | `/{post-id}/insights`             | Total times content was displayed  |
| LinkedIn | `impressions`           | `/organizationalEntityShareStatistics` | Total impressions on share    |
| TikTok   | `video_views`           | `/business/get/`                  | Views count as primary impression  |
| YouTube  | `views`                 | `/reports`                        | Number of times video was watched  |
| X        | `impression_count`      | `/tweets/{id}?tweet.fields=public_metrics` | Total tweet impressions   |

### Reach

| Platform | API Field                  | Endpoint                          | Notes                              |
|----------|----------------------------|-----------------------------------|------------------------------------|
| Meta     | `reach`                    | `/{post-id}/insights`             | Unique accounts that saw content   |
| LinkedIn | `uniqueImpressionsCount`   | `/organizationalEntityShareStatistics` | Unique member impressions     |
| TikTok   | `reach`                    | `/business/get/`                  | Unique viewers                     |
| YouTube  | `uniqueViewers`            | `/reports`                        | Unique viewers (channel level)     |
| X        | Not available via free API | N/A                               | Estimate from impressions          |

### Engagement (Aggregate)

| Platform | API Field               | Calculation                             | Notes                          |
|----------|-------------------------|-----------------------------------------|--------------------------------|
| Meta     | `post_engagements`      | reactions + comments + shares + clicks  | Native aggregate metric        |
| LinkedIn | `totalEngagements`      | likes + comments + shares + clicks      | Includes all interaction types |
| TikTok   | Derived                 | likes + comments + shares               | No native aggregate field      |
| YouTube  | Derived                 | likes + comments + shares               | No native aggregate field      |
| X        | Derived                 | likes + replies + retweets + quotes + url_clicks | No native aggregate    |

## Reaction / Like Metrics

| Platform | API Field          | Endpoint                          | Notes                                |
|----------|--------------------|-----------------------------------|--------------------------------------|
| Meta     | `reactions`        | `/{post-id}/insights`             | Includes like, love, wow, etc.       |
| LinkedIn | `likeCount`        | `/socialActions/{activity}/likes`  | Single like type                     |
| TikTok   | `likes`            | `/business/get/`                  | Heart reactions                      |
| YouTube  | `likes`            | `/videos?part=statistics`         | Thumbs up count                      |
| X        | `like_count`       | `/tweets/{id}?tweet.fields=public_metrics` | Heart reactions            |

## Comment Metrics

| Platform | API Field          | Endpoint                          | Notes                          |
|----------|--------------------|-----------------------------------|--------------------------------|
| Meta     | `comments`         | `/{post-id}/comments`             | Top-level + replies            |
| LinkedIn | `commentCount`     | `/socialActions/{activity}/comments` | Top-level comments          |
| TikTok   | `comments`         | `/business/get/`                  | Total comment count            |
| YouTube  | `comments`         | `/videos?part=statistics`         | Total comment count            |
| X        | `reply_count`      | `/tweets/{id}?tweet.fields=public_metrics` | Direct replies only   |

## Share / Repost Metrics

| Platform | API Field          | Endpoint                          | Notes                          |
|----------|--------------------|-----------------------------------|--------------------------------|
| Meta     | `shares`           | `/{post-id}/insights`             | Share count                    |
| LinkedIn | `shareCount`       | `/socialActions/{activity}/shares` | Reshare count                 |
| TikTok   | `shares`           | `/business/get/`                  | Share to external / friends    |
| YouTube  | `shares`           | `/reports`                        | Share button clicks            |
| X        | `retweet_count`    | `/tweets/{id}?tweet.fields=public_metrics` | Retweets + quote tweets |

## Click Metrics

| Platform | API Field          | Endpoint                          | Notes                          |
|----------|--------------------|-----------------------------------|--------------------------------|
| Meta     | `link_clicks`      | `/{post-id}/insights`             | Clicks on outbound links       |
| LinkedIn | `clickCount`       | `/organizationalEntityShareStatistics` | Clicks on content         |
| TikTok   | `clicks`           | `/business/get/`                  | Profile + link clicks          |
| YouTube  | `card_clicks`      | `/reports`                        | End screen and card clicks     |
| X        | `url_link_clicks`  | `/tweets/{id}?tweet.fields=organic_metrics` | Clicks on URLs in tweet |

## Video-Specific Metrics

| Platform | Metric                 | API Field               | Definition                        |
|----------|------------------------|-------------------------|-----------------------------------|
| Meta     | 3-second views         | `video_views`           | Views of 3+ seconds               |
| Meta     | ThruPlay               | `video_thruplay_views`  | Views to completion or 15s        |
| LinkedIn | Video views            | `videoViews`            | Views of 2+ seconds (50% pixels)  |
| TikTok   | Video views            | `video_views`           | Any display counts as a view      |
| YouTube  | Views                  | `views`                 | 30 seconds or completion          |
| YouTube  | Watch time (hours)     | `estimatedMinutesWatched` | Total minutes watched           |
| X        | Video views            | `view_count`            | Views of 2+ seconds (50% pixels)  |

## Follower / Audience Metrics

| Platform | API Field              | Endpoint                          | Notes                          |
|----------|------------------------|-----------------------------------|--------------------------------|
| Meta     | `page_followers`       | `/{page-id}?fields=followers_count` | Total page followers         |
| LinkedIn | `followerCount`        | `/organizationalEntityFollowerStatistics` | Total company followers |
| TikTok   | `follower_count`       | `/business/get/`                  | Total account followers        |
| YouTube  | `subscriberCount`      | `/channels?part=statistics`       | Total channel subscribers      |
| X        | `followers_count`      | `/users/{id}?user.fields=public_metrics` | Total account followers |

## API Rate Limits and Access Tiers

| Platform | Free Tier Limits             | Recommended Approach                     |
|----------|------------------------------|------------------------------------------|
| Meta     | 200 calls/hour per user      | Batch requests, cache responses          |
| LinkedIn | 100 calls/day (basic)        | CSV export for high-volume data          |
| TikTok   | Varies by app approval       | Business API requires approval           |
| YouTube  | 10,000 units/day             | Batch with `part` parameter optimization |
| X        | 500K tweets read/month (basic) | CSV export for historical data         |

## Engagement Rate Normalization

Standard formula for cross-platform comparison:

```
engagement_rate = total_engagements / reach
```

When reach is unavailable (e.g., X free tier), use:

```
engagement_rate_approx = total_engagements / impressions
```

Always label which denominator was used. Do not mix reach-based and
impression-based rates in the same comparison table.
