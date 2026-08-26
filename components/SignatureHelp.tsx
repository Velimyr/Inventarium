import HelpTooltip from './HelpTooltip';

/**
 * Пояснення формату шифру справи біля заголовка розділу про архівну справу.
 * Той самий формат перевіряє validateCaseSignature.
 */
export default function SignatureHelp() {
  return (
    <HelpTooltip label="Як має виглядати шифр справи">
      <span className="block">
        <b>Український архів:</b> шифр складається автоматично з полів Архів, Фонд, Опис,
        Справа — напр. <code className="text-[#2563EB]">ЦДІАК 1-2-3</code>.
      </span>
      <span className="block">
        <b>Іноземний архів:</b> вводиться вручну одним рядком — напр.{' '}
        <code className="text-[#2563EB]">AGAD ASK 1/7/0/9/4</code>.
      </span>
      <span className="block">
        Фонд, Опис і Справа не обов'язково числа: можна з літерами, крапкою, дефісом і тире —
        напр. <code className="text-[#2563EB]">КМФ-15</code>,{' '}
        <code className="text-[#2563EB]">2 дод.</code>, <code className="text-[#2563EB]">377 Ч. 1.</code>
      </span>
      <span className="block">
        Має містити щонайменше одну літеру й одну цифру. Без символів <code>\</code> та{' '}
        <code>?</code>, без лапок і надто довгого тексту.
      </span>
      <span className="block">
        Якщо та сама справа є ще в одному архіві — додайте її окремим рядком у полі «Сигнатура
        додаткової справи».
      </span>
    </HelpTooltip>
  );
}
