# Techijest — Topic Backlog

Tick the ones you want next. Numbers are stable, so you can just say "do 14 and 22".

**Status key:** `—` available · `BUILT` finished · `SCRIPTED` written but not finished · `DROPPED` written then abandoned · `REJECTED` do not re-propose

---

## Group 1 — Strong misconception-driven

The myth *is* the mystery, so these open themselves.

- [ ] **1. Your Phone Isn't Listening to You** — `DROPPED`
  Ads that feel psychic, explained by search history, location, app activity, cookies and behavioural profiling instead of the microphone.
- [ ] **2. Airplane Mode Doesn't Actually Disconnect Your Phone** — `—`
  What the toggle really controls: some radios drop, Wi-Fi and Bluetooth can come straight back, and GPS keeps listening because it never transmits.
- [ ] **3. The Cloud Is Just Someone Else's Computer** — `—`
  From the literal cloud icon down to data centres, storage, virtualization, networking and redundancy.
- [ ] **4. Why You Can't Just Copy Netflix** — `—`
  A tiny video file becomes a huge distribution problem: compression, CDNs, caching, bandwidth, geo-distribution.
- [ ] **5. Your Computer Doesn't Really Have a "File"** — `—`
  The Finder/Explorer object versus the metadata, blocks and filesystem structures underneath it.
- [ ] **6. Why Your Password Doesn't Need to Be Stored** — `—`
  Password → hash → database, and authentication without drowning the viewer in cryptography.
- [x] **7. How Does Your Phone Know Which Way You're Facing?** — `BUILT`
  Accelerometer, gyroscope, magnetometer and sensor fusion. 11 scenes, ~146s, six in 3D and five in 2D.
- [ ] **8. Why You Can Still Get a Notification With No Signal** — `—`
  An apparent contradiction resolved by Wi-Fi, cached notifications, delayed delivery and background connectivity.
- [ ] **9. Your Screen Isn't Actually Showing You a Video** — `—`
  Video → frames → pixels → RGB → electrical signals → refresh. A strong transformation chain.
- [ ] **10. Why 1GB of Storage Isn't Really 1GB** — `—`
  The number on the box versus the number the OS reports: decimal against binary units, plus filesystem overhead.

## Group 2 — More surprising, visually interesting

These earn their place on the strength of the picture.

- [ ] **11. Your Face Is Not a Password** — `—`
  Biometric authentication, and why Face ID isn't a stored photograph.
- [ ] **12. How Does Your Phone Unlock in the Dark?** — `—`
  Infrared and depth sensing feeding a biometric match.
- [ ] **13. Why QR Codes Still Work When They're Damaged** — `SCRIPTED`
  Destroy a QR code piece by piece and it still scans — error correction made visible.
- [ ] **14. How Does Google Maps Know There's Traffic?** — `—`
  Thousands of phones' location signals aggregated into a traffic estimate.
- [ ] **15. Why Two Computers Can Have the Same IP Address** — `—`
  Private addresses, NAT, routers and public IPs, on the apartment-building analogy.
- [ ] **16. Why Your IP Address Can Change Without You Moving** — `—`
  DHCP, ISP allocation and dynamic addressing.
- [ ] **17. Why the Internet Doesn't Break When One Cable Is Cut** — `—`
  Snap an undersea cable, watch traffic reroute: redundancy and routing.
- [ ] **18. How Does a Website Know You're Logged In?** — `—`
  The full journey — credentials, server, session or token, browser, and every request after — not just "cookies".
- [ ] **19. Why Websites Ask You to Accept Cookies** — `—`
  The popup, then necessary versus session versus analytics versus tracking, distinguished visually.
- [ ] **20. What Happens When You Delete Your Browser Cookies?** — `—`
  A relatable before-and-after.

## Group 3 — Advanced, still Feynman-able

Harder mechanisms that still reduce to something you can watch happen.

- [ ] **21. Why Your CPU Doesn't Need to Understand Python** — `—`
  Python → interpreter, compiler, runtime → machine instructions → CPU.
- [ ] **22. Why Your Computer Can Run 100 Apps at Once** — `—`
  Processes, threads, scheduling and context switching, on a visual CPU scheduler.
- [ ] **23. How Your Computer Finds a File in Milliseconds** — `—`
  Filesystem indexing, directories, metadata and storage addressing.
- [ ] **24. Why Copying a File Isn't Instant** — `—`
  Bytes moving storage to storage: bottlenecks, buffers, throughput.
- [ ] **25. Why Your Phone Gets Hot When You Do Almost Nothing** — `—`
  CPU and GPU load, radios, background processes, display, battery conversion, thermal throttling.
- [ ] **26. Why Your Battery Says 20% But Dies Anyway** — `—`
  Battery chemistry, voltage, estimation under load, and the battery management system.
- [ ] **27. Why Restarting an App Sometimes Fixes Everything** — `—`
  Processes, memory, state, connections and stale caches.
- [ ] **28. Why "Unlimited Storage" Isn't Actually Unlimited** — `—`
  The physical infrastructure and resource allocation behind the marketing word.
- [ ] **29. Why You Can't Just Make the Internet Faster** — `—`
  Bandwidth against latency against processing against congestion against routing against physics. Not one thing.
- [ ] **30. Why Your Video Starts Blurry Then Becomes HD** — `—`
  Adaptive bitrate streaming, buffering, CDN selection, network estimation, quality switching. **You flagged this as the best visual topic of the batch.**

## Group 4 — AI

The misconceptions here are enormous and almost entirely unaddressed, which is exactly the format's home ground.

- [ ] **31. ChatGPT Doesn't Actually Know What It's Saying** — `—`
  Prediction explained without making it sound stupid, and without collapsing into "it's just autocomplete".
- [ ] **32. How Does AI Turn Words Into Numbers?** — `—`
  Tokens → embeddings → vectors.
- [ ] **33. How Does AI Recognize a Cat?** — `—`
  Pixels → patterns → features → classification.
- [ ] **34. Why Can AI Make Something It Has Never Seen Before?** — `—`
  Learned representations and recombination.
- [ ] **35. Why Does AI Sometimes Sound Confidently Wrong?** — `—`
  Prediction against truth verification. **Overlaps heavily with 39 — see the note below.**
- [ ] **36. AI Doesn't "Remember" Everything You Tell It** — `—`
  Context windows, memory systems, retrieval, and what actually lives in the weights.
- [ ] **37. Why Does AI Need So Many GPUs?** — `—`
  Matrix operations, parallelism, memory bandwidth.
- [ ] **38. How Does AI Generate an Image From a Sentence?** — `—`
  Text representation → noise → iterative denoising → image.
- [ ] **39. Why Does AI Hallucinate?** — `—`
  Probably the strongest AI misconception topic of the batch. **Overlaps heavily with 35.**
- [ ] **40. Why Does Adding One Word Change an AI's Answer?** — `—`
  Context and the probability distribution.

## Group 5 — Data & storage

- [ ] **41. Where Does a Deleted File Actually Go?** — `—`
  Nowhere, at first. The pointer goes; the bytes sit there until something overwrites them.
- [ ] **42. How Can a Tiny USB Stick Hold Thousands of Photos?** — `—`
  Flash memory cells, bits, electrical states.
- [ ] **43. How Does Your SSD Find Your File So Fast?** — `—`
  Addressing without a physical seek.
- [ ] **44. Why Is Your SSD Faster Than a Hard Drive?** — `—`
  Flash memory against spinning magnetic platters. **Pairs naturally with 43 — consider making them one video.**
- [ ] **45. Why Does Your Computer Sometimes Take Forever to Find Something?** — `—`
  Search, indexing, filesystem metadata, storage access. **Close to 23 — see the note below.**
- [ ] **46. How Can a Computer Store a 4K Movie as Tiny Electrical Signals?** — `—`
  Compression and encoding down to charge states.
- [ ] **47. Why Does Copying 10GB Take Time Even on a Fast Computer?** — `—`
  **Same video as 24.** Keep one.
- [ ] **48. Why Does Your Computer Say You Have Less Storage Than You Bought?** — `—`
  **Same video as 10.** Keep one.
- [ ] **49. How Does a Memory Card Remember Your Photos After You Remove It?** — `—`
  Non-volatile storage: why the charge stays without power.
- [ ] **50. How Does Your Computer Know Which Bits Belong to Which File?** — `—`
  **Overlaps 5.** Could be the same video from the other end.

## Group 6 — Cybersecurity

- [ ] **51. How Does a Website Know Your Password Is Correct Without Storing It?** — `—`
  **Same video as 6.** Keep one — this phrasing is the better hook.
- [ ] **52. Why Can't You Just Guess Someone's Password?** — `—`
  Hashing, rate limiting and password entropy.
- [ ] **53. How Does HTTPS Actually Protect You?** — `—`
  Browser → certificate → keys → encrypted connection. Strong visual potential.
- [ ] **54. What Happens When You Click a Phishing Link?** — `—`
  The whole attack chain, followed end to end.
- [ ] **55. Why Does a Hacker Need Your Password If They Can Steal Your Session?** — `—`
  Cookies, tokens and sessions. **Pairs with 18.**
- [ ] **56. How Does Two-Factor Authentication Actually Stop Hackers?** — `—`
- [ ] **57. Why Is a 6-Digit Code Surprisingly Secure?** — `—`
  **Pairs with 56** — the mechanism and the maths behind it.
- [ ] **58. How Does Your Phone Know a Website's Certificate Is Legit?** — `—`
  Chain of trust. **Pairs with 53.**
- [ ] **59. Why Can't You Just Make a Fake Website Look Identical?** — `—`
  Visual deception → domain → certificates → authentication.
- [ ] **60. What Actually Happens When You Get Hacked?** — `—`
  Worth narrowing to a single account compromise rather than sensationalising.

## Group 7 — Web browsers

- [ ] **61. What Happens When You Type Google.com?** — `—`
  The canonical one. DNS, routing, TLS, render.
- [ ] **62. Why Does Your Browser Remember Websites You Visited?** — `—`
- [ ] **63. What Are Browser Cookies Actually Doing?** — `—`
  **Overlaps 19 and 20.** Three cookie topics is two too many; pick the strongest framing.
- [ ] **64. Why Does a Website Ask for Your Location?** — `—`
- [ ] **65. How Does a Website Know What Device You're Using?** — `—`
  User agents, feature detection, fingerprinting.
- [ ] **66. Why Does Refreshing a Website Sometimes Fix It?** — `—`
  **Close cousin of 27.**
- [ ] **67. Why Does Your Browser Use So Much RAM?** — `—`
- [ ] **68. How Can One Browser Tab Crash Without Crashing Everything?** — `—`
  Process isolation. **Pairs with 67 and 69 — these three are one strong video about the multi-process browser.**
- [ ] **69. Why Does Your Browser Have So Many Processes?** — `—`
- [ ] **70. How Does JavaScript Make a Website Interactive?** — `—`

## Group 8 — Physics hidden inside technology

The "make the physics animate" group. Strongest fit for the 3D medium.

- [ ] **71. How Does Wireless Charging Work Without Wires?** — `—`
  Coils → electromagnetic field → induced current. Extremely physical.
- [ ] **72. How Does Bluetooth Send Music Through the Air?** — `—`
- [ ] **73. How Does Wi-Fi Send Data Through the Air?** — `—`
  **Pairs with 72** — same physics, different framing.
- [ ] **74. How Does Your Remote Control Work Without a Wire?** — `—`
  Infrared, and why it needs line of sight.
- [ ] **75. How Does a Speaker Turn Electricity Into Sound?** — `—`
- [ ] **76. How Does a Microphone Turn Your Voice Into Electricity?** — `—`
  **The exact inverse of 75.** One video showing both directions would be stronger than either alone.
- [ ] **77. How Does Noise Cancellation Know What Sound to Remove?** — `—`
  Waves physically colliding and cancelling.
- [ ] **78. How Does GPS Know Where You Are?** — `—`
  Satellites, timing and trilateration. **Your #1 pick.**
- [ ] **79. How Does a Touchscreen Know Where You Touched?** — `—`
  Capacitive sensing. Finger → glass → electrical field → sensor grid → coordinates.
- [ ] **80. How Does Your Phone Camera Take a Picture in the Dark?** — `—`
  Sensor → photons → exposure → noise → multiple frames → computational reconstruction. **Your #3 pick.**

## Group 9 — Bigger system-level concepts

Potentially the most visually impressive episodes, since they are all systems in motion.

- [ ] **81. How Does Netflix Know What Video Quality Your Internet Can Handle?** — `—`
  **Same video as 30.** Keep one.
- [ ] **82. How Does Netflix Deliver the Same Movie to Millions of People?** — `—`
  One video → compression → quality ladder → CDN nodes → millions. **Overlaps 4.**
- [ ] **83. How Does Google Search Through Billions of Pages So Fast?** — `—`
  The index, not the search.
- [ ] **84. How Does Google Maps Handle Millions of People Moving at Once?** — `—`
  **Pairs with 14.**
- [ ] **85. How Does an Online Game Keep 100 Players in the Same World?** — `—`
  Machines → packets → server → state → synchronisation → latency. **Your #8 pick.**
- [ ] **86. Why Do Online Games Have Lag Even With Fast Internet?** — `—`
  **Pairs with 85** — bandwidth is not latency.
- [ ] **87. How Does a Video Call Keep Your Face Moving in Real Time?** — `—`
- [ ] **88. How Does Your Bank Know a Transaction Is Suspicious?** — `—`
  Transaction → location → device → spending pattern → risk model → decision. **Your #9 pick.**
- [ ] **89. How Does Amazon Know What You Might Want to Buy?** — `—`
  **Close to 1** — recommendation rather than advertising, but the same profiling spine.
- [ ] **90. How Does Your Email Find Spam Before You See It?** — `—`

## Group 10 — Already covered elsewhere

Listed for completeness. Each of these is a re-phrasing of a topic that already has a number.

- **How Does Your Phone Know It's Upside Down?** → **already made** as 7.
- **Why Does a QR Code Still Work When Half of It Is Missing?** → 13.
- **How Does Noise Cancellation Make Silence?** → 77.
- **How Does a Barcode Store Information?** → genuinely new, but sits closest to 13; consider one "codes that survive damage" video.
- **Why Can a Broken Download Resume Instead of Starting Over?** → genuinely new. Worth its own slot if you want it — say so and I'll number it.
- **How Does Your Phone Know You're Walking?** / **How Does Your Phone Count Your Steps Without Watching Your Feet?** → one topic, and it leans on the same accelerometer already covered in 7.
- **How Does Google Maps Recalculate Your Route So Quickly?** → genuinely new (pathfinding), distinct from 14 and 84.
- **Why Does Your GPS Sometimes Think You're on the Wrong Road?** → the natural second half of 78.
- **How Does a Computer Recognize Your Face?** → 11.

---

## Priority order

Your ranking, for optimising toward the animation engine rather than toward search volume.

| | Topic | Why |
|---|---|---|
| 1 | **78. How Does GPS Know Where You Are?** | Phone → satellites → Earth → radio signals → clocks → geometry → position. A 3D spatial model built around the viewer. |
| 2 | **71. How Does Wireless Charging Work Without Wires?** | Coils, fields, energy transfer. Extremely physical. |
| 3 | **80. How Does Your Phone Camera Take a Picture in the Dark?** | Photons → exposure → noise → many frames → reconstruction. |
| 4 | **77. Why Does Noise Cancellation Make Silence?** | Waves physically collide, cancel and transform. |
| 5 | **79. How Does a Touchscreen Know Where You Touched?** | Zoom from finger → glass → field → sensor grid → coordinates. |
| 6 | **13. Why Does a QR Code Still Work When Half of It Is Missing?** | Destroy it progressively, then visually reconstruct what was lost. |
| 7 | **32. How Does AI Turn Words Into Numbers?** | Text → tokens → vectors → high-dimensional space. |
| 8 | **85. How Does an Online Game Keep 100 Players in the Same World?** | Machines → packets → server → state → sync → latency. |
| 9 | **88. How Does Your Bank Know a Transaction Is Suspicious?** | Transaction → signals → risk model → decision. |
| 10 | **82. How Does Netflix Deliver One Movie to Millions of People?** | One video → compression → quality ladder → CDN → millions. |

---

## Rejected

- **Tracking parameters in long URLs** — `REJECTED` 2026-08-18. Scripted as `url-tracking-parameters-stage-2026-08-18.txt` and killed on sight: showed code throughout and never made its point. Do not re-propose.

---

## The pattern worth holding onto

The episodes that work aren't really "technology topics". They're questions where the viewer **already holds an incorrect mental model** — which is what gives you something to break on screen before you build the right one.

| Premise | The wrong model the viewer arrives with |
|---|---|
| Your phone knows which way you're facing | The phone somehow just knows |
| Wireless charging works without wires | Electricity jumps through space |
| GPS knows where you are | Satellites are tracking your phone directly |
| AI understands what you wrote | There is a little mind inside the computer |
| A QR code survives being destroyed | Every square has to be intact |

That structure — **show the wrong model, physically break it, build the right one** — is the same spine the orientation video runs on, and it's why the misconception groups outperform the "how does X work" phrasings. When choosing between two framings of the same topic, take the one that names a belief rather than a component.

## Notes

- **Media now available per scene:** 2D Stage (mechanism diagrams, UI, code, maps) and 3D Spatial (volumetric objects, travelling camera, reference frames, orbits, ground planes). Mix them per scene rather than committing a whole video to one.
- **Strong 3D candidates** from the list above: 14 (traffic aggregating over a city), 17 (undersea cables and rerouting), 22 (a CPU scheduler as a physical machine), 30 (bitrate switching as a live system).
- **Strong 2D candidates:** 6, 18, 19, 21 — these are mechanism-and-interface topics that read better flat.
- **The AI group leans 3D harder than the rest.** 32 is literally a vector space, 34 is movement through one, and 38 is a picture emerging out of noise — all three want depth and a camera that can travel. 31, 36 and 40 are the opposite: they hinge on text and context, so they belong in the 2D medium with the code/typography treatment.
- **35 and 39 are close to the same video.** "Confidently wrong" and "hallucinates" both come down to a model optimising for a plausible next token with no step that checks the claim against the world. Pick one and make it properly, or make 39 the mechanism and keep 35's confidence angle as one scene inside it. Making both would repeat the payoff.
