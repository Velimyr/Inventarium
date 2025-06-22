import { useState, Fragment } from 'react';
import { Dialog } from '@headlessui/react';
import Header from '../components/header';
import emailjs from 'emailjs-com';

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
      <main className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6">
        <div className="max-w-xl mx-auto">
          <h1 className="text-3xl font-bold mb-6 text-center">Відгуки та побажання</h1>
          <p className="mb-6 text-center text-gray-700 dark:text-gray-300">
            Будь ласка, поділіться своїми пропозиціями для покращення Inventarium.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="block mx-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded shadow"
          >
            Залишити відгук
          </button>
        </div>

        <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} as={Fragment}>
          <div className="fixed inset-0 bg-black bg-opacity-30 z-40 flex items-center justify-center">
            <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md max-w-lg w-full z-50">
              <Dialog.Title className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">
                Відгук та побажання
              </Dialog.Title>

              <label className="block mb-3 font-medium text-gray-700 dark:text-gray-300">
                Ім'я <span className="text-red-600">*</span>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Ваше ім'я"
                  required
                />
              </label>

              <label className="block mb-3 font-medium text-gray-700 dark:text-gray-300">
                Контакти <span className="text-red-600">*</span>
                <input
                  type="text"
                  value={contacts}
                  onChange={e => setContacts(e.target.value)}
                  className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Facebook, Telegram, Email тощо"
                  required
                />
              </label>

              <label className="block mb-4 font-medium text-gray-700 dark:text-gray-300">
                Ваша пропозиція для покращення Inventarium <span className="text-red-600">*</span>
                <textarea
                  value={proposal}
                  onChange={e => setProposal(e.target.value)}
                  placeholder="Опишіть вашу ідею або пропозицію"
                  rows={5}
                  className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                />
              </label>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
                  disabled={sending}
                >
                  Скасувати
                </button>
                <button
                  onClick={sendFeedback}
                  disabled={!isFormValid || sending}
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {sending ? 'Надсилання...' : 'Надіслати'}
                </button>
              </div>

              {submitted && (
                <p className="text-green-600 mt-3 text-sm text-center">Дякуємо за ваш відгук!</p>
              )}
            </div>
          </div>
        </Dialog>
      </main>
    </>
  );
}
