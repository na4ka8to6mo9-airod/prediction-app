const { createClient } = require('@supabase/supabase-js');

async function judge() {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const weatherApiKey = process.env.OPENWEATHER_API_KEY;

    // 1. 判定待ち(closed)または実行中(open)の昨日のお題を取得
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const { data: predictions } = await supabase
        .from('predictions')
        .select('*')
        .eq('target_date', dateStr)
        .eq('status', 'open');

    if (!predictions || predictions.length === 0) return console.log("判定対象のお題はありません");

    for (const pred of predictions) {
        // 2. OpenWeather APIで昨日の天気を取得（東京: 1850147）
        const res = await fetch(`api.openweathermap.org{weatherApiKey}`);
        const weatherData = await res.json();
        
        // 天気コード 800台が「晴れ」
        const isSunny = weatherData.weather[0].main === 'Clear';
        console.log(`判定日: ${dateStr}, 結果: ${isSunny ? "晴れ" : "晴れ以外"}`);

        // 3. 正解者にポイント配布
        const { data: bets } = await supabase
            .from('user_bets')
            .select('*')
            .eq('prediction_id', pred.id)
            .eq('is_processed', false);

        for (const bet of bets) {
            if (bet.prediction_choice === isSunny) {
                // 当たった場合：50pt加算
                await supabase.rpc('increment_points', { user_id: bet.user_id, amount: 50 });
            } else {
                // 外れた場合：30pt減算
                await supabase.rpc('increment_points', { user_id: bet.user_id, amount: -30 });
            }
            await supabase.from('user_bets').update({ is_processed: true }).eq('id', bet.id);
        }

        // 4. お題を完了(finished)にする
        await supabase.from('predictions').update({ 
            status: 'finished', 
            correct_answer: isSunny 
        }).eq('id', pred.id);
    }
}

judge();
