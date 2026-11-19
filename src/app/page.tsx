import type { Metadata } from "next";
import { CoinIcon, PetIllustration, PhoneIcon, RoomIllustration, TowelIcon } from "@/components/lp/Illustrations";
import { PageViewTracker, TrackedSignupForm } from "@/components/lp/Tracking";

export const metadata: Metadata = {
  title: "おふろクエスト（開発中）| お風呂が、毎日の小さなクエストになる。",
  description:
    "お風呂に入るとコインが貯まり、無料ガチャでペットや家具を集められるアプリを開発中です。無料の事前登録でリリース情報をお届けします。",
};

const FEATURES = [
  {
    title: "お風呂までの|小さなクエスト",
    body: "「タオルを用意する」など、お風呂に入るまでの行動を小さなステップに分けて案内する予定です。",
    icon: <TowelIcon className="feature-icon" />,
  },
  {
    title: "入浴で|コインが貯まる",
    body: "入浴を記録すると、ゲーム内のコイン（無料）がもらえる予定です。",
    icon: <CoinIcon className="feature-icon" />,
  },
  {
    title: "無料コインで|ガチャ",
    body: "貯めたコインでガチャを回し、ペット・衣装・家具を集められる予定です。",
    icon: <CoinIcon className="feature-icon" title="ガチャ" />,
  },
  {
    title: "ペットを|育てる",
    body: "お風呂に入るほど、いっしょに暮らすペットが育っていく予定です。",
    icon: <PetIllustration className="feature-icon" title="ペット" />,
  },
  {
    title: "家具や衣装を|集める",
    body: "集めた衣装でペットを着せ替えたり、家具をコレクションしたりできる予定です。",
    icon: <TowelIcon className="feature-icon" title="衣装と家具" />,
  },
  {
    title: "横から見る|2Dマイホーム",
    body: "横から見た2Dの部屋に、集めた家具を置いて自分だけの部屋を作れる予定です。",
    icon: <PhoneIcon className="feature-icon" title="マイホーム" />,
  },
];

const FAQ = [
  {
    q: "無料で遊べますか？",
    a: "基本無料で遊べる予定です。追加キャラクターなど一部の有料要素を検討していますが、内容・価格は未定です。",
  },
  { q: "いつ公開されますか？", a: "未定です。公開が決まったら、事前登録した方にメールでお知らせします。" },
  {
    q: "iPhone・Androidで使えますか？",
    a: "iPhone・Android のブラウザから使えるアプリ（PWA）として開発しています。対応する機種・OS のバージョンは未定です。",
  },
  {
    q: "写真を送信する必要がありますか？",
    a: "事前登録に写真は必要ありません。アプリでは入浴前後のタオル撮影を予定していますが、画像はスマートフォンの中で判定し、外部の AI サービスに送らない設計を方針としています。開発中のため、詳細は変更になる場合があります。",
  },
  {
    q: "事前登録すると何が届きますか？",
    a: "登録確認のメールと、公開のお知らせなどリリースに関する情報が届きます。任意の項目にチェックした場合のみ、そのほかのお知らせも届きます。",
  },
  {
    q: "登録は解除できますか？",
    a: "はい。届いたメールのリンクから、いつでも配信停止・登録データの削除ができます。",
  },
];

export default function Home() {
  return (
    <main className="lp">
      <PageViewTracker />
      <header className="hero">
        <p className="badge">開発中のアプリです・公開日未定</p>
        <PetIllustration className="hero-pet" />
        <h1 className="hero-title">
          <span className="nb">お風呂が、</span>
          <span className="nb">毎日の小さな</span>
          <span className="nb">クエストになる。</span>
        </h1>
        <p className="hero-lead">
          <span className="nb">お風呂に入るとコインが貯まる。</span>
          <span className="nb">ガチャでペットや家具を集めて、</span>
          <span className="nb">自分だけの部屋を育てよう。</span>
        </p>
        <a href="#signup" className="button-primary button-block">
          無料で事前登録する
        </a>
        <p className="note">リリース情報をメールでお届けします。画像はすべて開発中のコンセプトイメージです。</p>
      </header>

      <section className="section">
        <h2 className="section-title">
          <span className="nb">「あとで入ろう」が、</span>
          <span className="nb">気づけば深夜に</span>
        </h2>
        <p>
          そろそろお風呂に入ろうと思いながら、つい動画や SNS を見続けて、気づけば夜遅く——。そんなふうに、お風呂を後回しにしてしまうことはありませんか。
        </p>
        <p>おふろクエストは、お風呂に入るまでの「最初の一歩」を、小さなクエストにして後押しすることを目指して開発中のアプリです。</p>
      </section>

      <section className="section">
        <h2 className="section-title">
          <span className="nb">おふろクエストで</span>
          <span className="nb">できること（予定）</span>
        </h2>
        <ul className="features">
          {FEATURES.map((f) => (
            <li key={f.title} className="feature-card">
              {f.icon}
              <div>
                <h3 className="feature-title">
                  {f.title.split("|").map((part) => (
                    <span key={part} className="nb">
                      {part}
                    </span>
                  ))}
                </h3>
                <p>{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <figure className="room">
          <RoomIllustration className="room-image" />
          <figcaption className="note">2Dマイホームのイメージ（開発中のコンセプトイメージです）</figcaption>
        </figure>
      </section>

      <section className="section photo">
        <h2 className="section-title">
          <span className="nb">入浴前後の</span>
          <span className="nb">「タオル撮影」について</span>
        </h2>
        <ol className="photo-steps">
          <li>
            <TowelIcon className="step-icon" />
            <span>
              <strong>入浴前</strong>にタオルを1回撮影
            </span>
          </li>
          <li>
            <TowelIcon className="step-icon" />
            <span>
              <strong>入浴後</strong>にタオルをもう1回撮影
            </span>
          </li>
        </ol>
        <p>
          入浴の前と後に、タオルなど身の回りの物を1回ずつ、合計2回撮影する機能を予定しています。人や体を撮影する必要はありません。
        </p>
        <p>画像の判定は、お使いのスマートフォンの中で行う方式を検討しています。写真を外部の AI サービスに送らない設計を方針としています。</p>
        <p className="caution">
          この機能は開発中です。認識の精度、対応機種、画像の扱いの詳細は検証中で、変更になる場合があります。また、撮影による判定は、入浴したことを証明するものではありません。
        </p>
      </section>

      <section className="section signup" id="signup">
        <h2 className="section-title">無料事前登録</h2>
        <p>メールアドレスだけで登録できます。公開が決まったらお知らせします。</p>
        <TrackedSignupForm />
      </section>

      <section className="section">
        <h2 className="section-title">よくある質問</h2>
        <dl className="faq">
          {FAQ.map((item) => (
            <div key={item.q} className="faq-item">
              <dt>{item.q}</dt>
              <dd>{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="footer">
        <p>おふろクエストは開発中のサービスです。掲載内容は予定であり、変更になる場合があります。</p>
        <p>
          <a href="/privacy">プライバシーポリシー</a>
        </p>
      </footer>
    </main>
  );
}
