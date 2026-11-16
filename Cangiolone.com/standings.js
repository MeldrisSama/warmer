'use strict';

function rankStandings(users,matches){
  const rows=users.map(
    u=>({
      ...u,
      played:0,
      w:0,
      d:0,
      l:0,
      diff:0,
      points:0
    })
  );

  const lookup=Object.fromEntries(
    rows.map(u=>[u.id,u])
  );

  for(const m of matches.filter(m=>!m.void)){
    const a=lookup[m.a];
    const b=lookup[m.b];

    if(!a||!b){
      continue;
    }

    a.played++;
    b.played++;

    a.diff+=m.scoreA-m.scoreB;
    b.diff+=m.scoreB-m.scoreA;

    if(m.scoreA>m.scoreB){
      a.w++;
      b.l++;
      a.points+=3;
    }else if(m.scoreA<m.scoreB){
      b.w++;
      a.l++;
      b.points+=3;
    }else{
      a.d++;
      b.d++;
      a.points++;
      b.points++;
    }
  }

  rows.sort(
    (a,b)=>
      b.points-a.points ||
      b.diff-a.diff ||
      a.name.localeCompare(b.name,'it')
  );

  let rank=0;
  return rows.map((row,i)=>{
    if(!i || row.points!==rows[i-1].points || row.diff!==rows[i-1].diff) rank=i+1;
    return {...row,rank};
  });
}
