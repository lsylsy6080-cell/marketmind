function nthWeekdayOfMonth(
  year:number,
  monthIndex:number,
  weekday:number,
  nth:number,
):number{
  const first=new Date(Date.UTC(year,monthIndex,1));
  const offset=(weekday-first.getUTCDay()+7)%7;
  return 1+offset+(nth-1)*7;
}

function firstWeekdayOfMonth(
  year:number,
  monthIndex:number,
  weekday:number,
):number{
  return nthWeekdayOfMonth(year,monthIndex,weekday,1);
}

/**
 * 미국 동부시간 16:00(현물 ETF 정규장 마감)을 UTC로 변환한다.
 * 미국 DST: 3월 둘째 일요일 ~ 11월 첫째 일요일.
 */
export function usEtMarketCloseUtc(flowDate:string):string{
  const match=flowDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)throw new Error(`ETF flowDate 형식 오류: ${flowDate}`);

  const year=Number(match[1]);
  const month=Number(match[2]);
  const day=Number(match[3]);

  const dstStartDay=nthWeekdayOfMonth(year,2,0,2);
  const dstEndDay=firstWeekdayOfMonth(year,10,0);

  const isDst=
    (month>3&&month<11) ||
    (month===3&&day>=dstStartDay) ||
    (month===11&&day<dstEndDay);

  const utcHour=isDst?20:21;
  return new Date(Date.UTC(year,month-1,day,utcHour,0,0)).toISOString();
}
