import { useState, Fragment } from 'react';
import { Dialog } from '@headlessui/react';
import Header from '../components/header';
import emailjs from 'emailjs-com';
import { MessageSquare, Send } from 'lucide-react';

export default function FeedbackPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [contacts, setContacts] = useState('');
  const [proposal, setProposal] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const isFormValid = name.trim() !== '' && contacts.trim() !== '' && proposal.trim() !== '';

  const sendFeedback = async () => {
    if (!isFormValid) return;

    setSending(true);
    try {
      await emailjs.send(
        'service_kdqzv9e',       // заміни на свій service ID
        'template_tpm1eul',      // заміни на свій template ID
        {
          name,
          contacts,
          proposal,
          url: window.location.href,
        },
        'WBCc_TP1lGiy8DVtF'      // заміни на свій public key
      );
      setSubmitted(true);
      setTimeout(() => {
        setIsModalOpen(false);
        setName('');
        setContacts('');
        setProposal('');
        setSubmitted(false);
      }, 2500);
    } catch (err) {
      console.error('Помилка надсилання:', err);
      alert('Сталася помилка під час надсилання повідомлення.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Header />
      <main className="min-h-screen bg-white dark:bg-[#111827]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">
          {/* Page Title */}
          <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold mb-[20px] lg:mb-[29px] text-center">
            Відгуки та побажання
          </h1>

          {/* Main Content Card */}
          <div className="p-[20px] lg:p-[30px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col gap-[30px] lg:gap-[40px] max-w-xl mx-auto">
            
            {/* Introduction */}
            <div className="flex flex-col gap-[15px]">
              <div className="flex items-center gap-[10px] justify-center">
                <MessageSquare className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                  Ваша думка важлива
                </h2>
              </div>
              <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] text-center">
                Будь ласка, поділіться своїми пропозиціями для покращення Inventarium.
              </p>
            </div>

            {/* Call to Action Button */}
            <div className="flex justify-center">
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-[8px] lg:gap-[10px] px-[15px] lg:px-[20px] h-[40px] lg:h-[44px] rounded bg-[#2563EB] hover:bg-[#1D4ED8]"
              >
                <Send className="w-4 h-4 text-white flex-shrink-0" strokeWidth={1.6} />
                <span className="text-white text-[15px] lg:text-[16px] font-semibold whitespace-nowrap">Залишити відгук</span>
              </button>
            </div>

          </div>
        </div>

        {/* Modal */}
        <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} as={Fragment}>
          <div className="fixed inset-0 bg-black bg-opacity-30 z-40 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#1F2937] p-6 rounded-lg shadow-md max-w-lg w-full z-50 border border-gray-300 dark:border-[#374151]">
              <Dialog.Title className="text-[20px] font-semibold mb-4 text-gray-900 dark:text-[#F3F4F6]">
                Відгук та побажання
              </Dialog.Title>

              <label className="block mb-4 font-medium text-gray-900 dark:text-white">
                Ім'я <span className="text-red-500">*</span>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full mt-2 p-2 border border-gray-300 dark:border-[#374151] rounded bg-white dark:bg-[#111827] text-gray-900 dark:text-white"
                  placeholder="Ваше ім'я"
                  required
                />
              </label>

              <label className="block mb-4 font-medium text-gray-900 dark:text-white">
                Контакти <span className="text-red-500">*</span>
                <input
                  type="text"
                  value={contacts}
                  onChange={e => setContacts(e.target.value)}
                  className="w-full mt-2 p-2 border border-gray-300 dark:border-[#374151] rounded bg-white dark:bg-[#111827] text-gray-900 dark:text-white"
                  placeholder="Facebook, Telegram, Email тощо"
                  required
                />
              </label>

              <label className="block mb-4 font-medium text-gray-900 dark:text-white">
                Ваша пропозиція для покращення Inventarium <span className="text-red-500">*</span>
                <textarea
                  value={proposal}
                  onChange={e => setProposal(e.target.value)}
                  placeholder="Опишіть вашу ідею або пропозицію"
                  rows={5}
                  className="w-full mt-2 p-2 border border-gray-300 dark:border-[#374151] rounded bg-white dark:bg-[#111827] text-gray-900 dark:text-white"
                  required
                />
              </label>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-[#374151]"
                  disabled={sending}
                >
                  Скасувати
                </button>
                <button
                  onClick={sendFeedback}
                  disabled={!isFormValid || sending}
                  className="px-4 py-2 rounded bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  {sending ? 'Надсилання...' : 'Надіслати'}
                </button>
              </div>

              {submitted && (
                <p className="text-green-600 dark:text-green-400 mt-3 text-sm text-center">Дякуємо за ваш відгук!</p>
              )}
            </div>
          </div>
        </Dialog>
      </main>
    </>
  );
}