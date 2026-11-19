package app.ghostclipper;

import java.util.ArrayDeque;
import java.util.Iterator;

/** Detects sudden chat-rate increases using a rolling baseline and cooldown. */
public final class ChatSpikeDetector {
    public static final class Spike {
        public final long timestampMs;
        public final int recentMessages;
        public final double baselineMessagesPer10Seconds;
        public final double multiplier;
        Spike(long t,int n,double b,double m){timestampMs=t;recentMessages=n;baselineMessagesPer10Seconds=b;multiplier=m;}
    }
    private final ArrayDeque<Long> arrivals=new ArrayDeque<>();
    private long lastTriggerMs=0;

    public synchronized Spike add(long timestampMs,int count) {
        if(count<=0)return null;
        for(int i=0;i<count;i++)arrivals.addLast(timestampMs);
        long cutoff=timestampMs-90000L;
        while(!arrivals.isEmpty()&&arrivals.peekFirst()<cutoff)arrivals.removeFirst();

        long recentStart=timestampMs-10000L;
        int recent=0,baseline=0;
        for(Long t:arrivals){
            if(t>=recentStart)recent++;
            else if(t>=timestampMs-70000L)baseline++;
        }
        double baselinePer10=baseline/6.0;
        double threshold=Math.max(8.0,baselinePer10*3.0);
        if(recent<threshold||timestampMs-lastTriggerMs<30000L)return null;
        // Avoid a false positive during the first few seconds: require a meaningful burst.
        if(timestampMs<60000L&&recent<12)return null;
        lastTriggerMs=timestampMs;
        return new Spike(timestampMs,recent,baselinePer10,baselinePer10<=0?recent:recent/baselinePer10);
    }

    public synchronized void reset(){arrivals.clear();lastTriggerMs=0;}
}
