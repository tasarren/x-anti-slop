// Local media fixture only. Matching, hiding, whitelisting and settings use the real bundles.
const posts = [
  { handle: "demo_alex", name: "Alex Rivera", avatar: "AR", color: "#5a514b", time: "12m", text: "Spent the morning turning an old shelf into a plant stand.\nA little sanding goes a long way.", replies: "8", likes: "46" },
  { handle: "demo_daily", name: "Daily Ideas", avatar: "DI", color: "#4c3c62", time: "19m", text: "The future is already here — and it changes everything.\nHere are 7 ideas to completely transform your workflow.", replies: "24", likes: "128", verified: true },
  { handle: "demo_sam", name: "Sam Chen", avatar: "SC", color: "#48676b", time: "25m", text: "A small update — the community garden opens Saturday.\nBring a mug. We’ll put the kettle on.", replies: "12", likes: "83" },
  { handle: "demo_robin", name: "Robin Park", avatar: "RP", color: "#696047", time: "32m", text: "Taking the slow route home today. Worth it.", replies: "5", likes: "62", media: true },
  { handle: "demo_updates", name: "The Update", avatar: "TU", color: "#765452", time: "41m", text: "This «simple framework» will change how you think about productivity.", replies: "19", likes: "91" },
  { handle: "demo_weekend", name: "Weekend Notes", avatar: "WN", color: "#375d72", time: "48m", text: "Our book swap is back this Sunday!\nBring something you loved, leave with something new.", replies: "3", likes: "29" },
  { handle: "demo_giveaway", name: "Launch Board", avatar: "LB", color: "#69517c", time: "1h", text: "GIVEAWAY: repost for a chance to win a new setup.\nEntries close tonight.", replies: "51", likes: "203" },
  { handle: "demo_jules", name: "Jules Morgan", avatar: "JM", color: "#466560", time: "5m", text: "Here is the post we were talking about.\nMy comment stays visible while the quote is filtered.", replies: "4", likes: "17", quote: true },
];
const timeline = document.querySelector("#posts");
function icon(name) { const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");const use=document.createElementNS(svg.namespaceURI,"use");use.setAttribute("href",`#${name}`);svg.append(use);return svg; }
for (const post of posts) {
  const cell = document.createElement("div"); cell.dataset.testid = "cellInnerDiv"; cell.id = post.handle;
  const article = document.createElement("article"); article.dataset.testid = "tweet";
  const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = post.avatar; avatar.style.background = post.color;
  const body = document.createElement("div"); body.className = "post-body";
  const row = document.createElement("div"); row.className="user-row";
  const user = document.createElement("div"); user.dataset.testid="User-Name";
  const author=document.createElement("a");author.href=`https://x.com/${post.handle}`;const name=document.createElement("b");name.textContent=post.name;author.append(name);user.append(author);
  if(post.verified){const badge=document.createElement("span");badge.className="verified";badge.append(icon("check"));user.append(badge);}
  const handle=document.createElement("a");handle.href=author.href;handle.className="handle";handle.textContent=`@${post.handle}`;user.append(handle);
  const date=document.createElement("a");date.href=`https://x.com/${post.handle}/status/100`;const time=document.createElement("time");time.textContent=`· ${post.time}`;date.append(time);user.append(date);
  const more=document.createElement("span");more.className="more";more.textContent="···";row.append(user,more);
  const text=document.createElement("div");text.dataset.testid="tweetText";text.textContent=post.text;
  body.append(row,text);
  if(post.quote){const quoted=document.createElement("div");quoted.className="quoted-post";quoted.setAttribute("role","link");quoted.tabIndex=0;quoted.innerHTML='<div data-testid="UserAvatar-Container-demo_daily"></div><div class="user-row"><div data-testid="User-Name"><b>Daily Ideas</b><span class="handle">@demo_daily</span></div></div><div data-testid="tweetText">The future is already here — and it changes everything.</div>';body.append(quoted);}
  if(post.media){const media=document.createElement("div");media.className="post-image";const line=document.createElement("div");line.textContent="Take the long way.";const small=document.createElement("small");small.textContent="WEEKEND NOTES";line.prepend(small);media.append(line);body.append(media);}
  const actions=document.createElement("div");actions.className="actions";
  for(const [type,count] of [["reply",post.replies],["repost","6"],["heart",post.likes],["views","2.4K"],["bookmark",""],["share",""]]){const action=document.createElement("span");action.append(icon(type),count);actions.append(action);}
  body.append(actions);article.append(avatar,body);cell.append(article);timeline.append(cell);
}
