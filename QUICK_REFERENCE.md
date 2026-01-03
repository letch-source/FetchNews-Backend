# Quick Reference - Automatic Feed System

## 🎯 What Changed

### Before
- Users manually fetch news
- Select topics for each fetch
- Tap "Fetch Now" button

### After
- Feed updates automatically at 6am & 6pm
- Topics are permanent subscriptions
- No manual fetching needed

## 📱 User Flow

```
1. Select Topics (once)
   ↓
2. Feed updates at 6am & 6pm
   ↓
3. Swipe through topics
   ↓
4. Skip topics you don't want
```

## ⏰ Update Schedule

- 🌅 **6:00 AM** - Morning news
- 🌆 **6:00 PM** - Evening news
- 📅 **Every day** - All week
- 🌍 **Your timezone** - Automatic

## 🏗️ Architecture

```
TopicsView (Tab 2)
├── Select topics (permanent)
├── Visual schedule indicator
└── No fetch button

TopicFeedView (Tab 1)
├── Vertical scrolling feed
├── One topic per screen
├── Auto-scroll with audio
└── Next update time shown

NewsVM
├── ensureAutomaticFetchSchedule()
├── Creates 6am/6pm schedules
└── Syncs selected topics
```

## 📝 Key Files

1. **TopicsView.swift** - Topic management
2. **TopicFeedView.swift** - TikTok-style feed
3. **NewsVM.swift** - Automatic scheduling
4. **AUTOMATIC_FEED_SYSTEM.md** - Full docs

## ✅ Testing

- [ ] New user gets 6am/6pm schedules
- [ ] Topics stay selected permanently
- [ ] Next update time displays correctly
- [ ] Feed updates at 6am/6pm
- [ ] Notifications sent

## 🚀 Deploy

1. Test on simulator
2. Test on device
3. Verify backend cron jobs
4. Monitor schedule creation
5. Track user engagement

---

**Status:** ✅ Complete  
**Date:** January 2, 2026
