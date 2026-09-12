-- MMSS Job Board Seed Data
-- ===========================
-- Run this after migration to add sample data for development

-- Insert sample jobs
INSERT INTO jobs (title, company, location, work_mode, job_type, url, description, tags, posted_at, closing_at, is_active, source) VALUES
(
  'Marketing Intern',
  'Tech Startup Co',
  'Melbourne, VIC',
  'hybrid',
  'internship',
  'https://example.com/apply/1',
  'We are looking for a motivated Marketing Intern to join our growing team. You will assist with social media management, content creation, and campaign analytics.

Responsibilities:
- Manage social media accounts
- Create engaging content
- Analyze campaign performance
- Support marketing team initiatives

Requirements:
- Currently studying Marketing or related field
- Strong communication skills
- Familiarity with social media platforms
- Basic knowledge of analytics tools',
  ARRAY['Social Media', 'Creative', 'Analytics', 'Digital'],
  NOW() - INTERVAL '3 days',
  NOW() + INTERVAL '30 days',
  TRUE,
  'manual'
),
(
  'Graduate Marketing Coordinator',
  'Global Brands Inc',
  'Sydney, NSW',
  'onsite',
  'graduate',
  'https://example.com/apply/2',
  'Join our marketing team as a Graduate Marketing Coordinator. This role offers excellent training and career development opportunities.

What you''ll do:
- Coordinate marketing campaigns
- Manage vendor relationships
- Track project timelines
- Support brand initiatives

What we''re looking for:
- Recent marketing graduate
- Strong organizational skills
- Excellent attention to detail
- Team player attitude',
  ARRAY['Brand', 'Management'],
  NOW() - INTERVAL '7 days',
  NOW() + INTERVAL '21 days',
  TRUE,
  'manual'
),
(
  'Social Media Specialist',
  'Creative Agency',
  'Melbourne, VIC',
  'remote',
  'part-time',
  'https://example.com/apply/3',
  'Part-time opportunity for a creative Social Media Specialist. Perfect for students looking to gain real-world experience.

About the role:
- Create and schedule social content
- Engage with community
- Monitor trends
- Report on metrics

Requirements:
- Strong copywriting skills
- Understanding of social platforms
- Creative mindset
- Available 15-20 hours/week',
  ARRAY['Social Media', 'Creative'],
  NOW() - INTERVAL '5 days',
  NOW() + INTERVAL '14 days',
  TRUE,
  'manual'
),
(
  'Digital Marketing Assistant',
  'E-commerce Solutions',
  'Brisbane, QLD',
  'hybrid',
  'casual',
  'https://example.com/apply/4',
  'Casual digital marketing support — SEO, email marketing and content updates, flexible hours.',
  ARRAY['Digital'],
  NOW() - INTERVAL '2 days',
  NULL,
  TRUE,
  'manual'
),
(
  'Marketing Analytics Intern',
  'Data Insights Ltd',
  'Melbourne, VIC',
  'onsite',
  'internship',
  'https://example.com/apply/5',
  'Internship in marketing analytics — Google Analytics, data visualization and A/B testing.',
  ARRAY['Analytics'],
  NOW() - INTERVAL '10 days',
  NOW() + INTERVAL '5 days',
  TRUE,
  'manual'
),
(
  'Content Marketing Writer',
  'Publishing House',
  'Perth, WA',
  'remote',
  'contract',
  'https://example.com/apply/6',
  '3-month remote contract for a content writer looking to build their portfolio.',
  ARRAY['Creative'],
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '45 days',
  TRUE,
  'manual'
);

-- Note: To create an admin user, first create a user via Supabase Auth,
-- then run:
-- INSERT INTO admin_users (id, is_admin)
-- SELECT id, TRUE FROM auth.users WHERE email = 'your-admin@email.com';
