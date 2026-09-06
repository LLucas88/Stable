## Input
We want to add real-time notifications to our app. Engineering says it's complicated and needs discovery time. I want to structure it properly.

## Expected output
Technical questions to resolve (provisional):
"It's complicated" is not enough to scope a discovery. Before planning the discovery, the specific unknowns need to be named. Common technical questions for real-time notifications:
- Which delivery mechanism is appropriate (WebSockets, Server-Sent Events, push notifications via FCM/APNs, or polling)?
- What is the expected volume of notifications per user per day, and what infrastructure can handle it?
- What are the latency requirements (real-time means <1 second? <5 seconds? what's acceptable)?
- What happens when a user is offline — are notifications queued and delivered on reconnect?

These are examples. The actual questions depend on what engineering flagged as uncertain.

Discovery time box:
Not set. Recommendation: time-box to 1-2 sprints maximum. Open-ended discovery delays delivery without producing better decisions.

Definition of done:
Cannot define without knowing the specific unknowns. At minimum: discovery is done when engineering is confident enough in the approach to give a delivery estimate.

Spike tasks:
Not designed — depends on what questions need to be answered.

Discovery readout format:
Standard: joint session with PM and engineering at the end of the time box. Engineering presents findings; PM and engineering agree on a technical approach; delivery planning begins.

Missing information:
- What specifically does engineering say is complicated or uncertain?
- What delivery mechanism options are being considered?
- Is this for web, mobile, or both?
- What volume and latency requirements exist?

Suggested first step:
Run a 30-minute session with engineering before scoping discovery: "Name the top 3 things you don't know yet that would change how we build this." Those three things become the discovery agenda.

Confidence level:
Provisional
