// ============================================
// Main Application Component
// ============================================

import React, { useEffect, useState } from 'react';
import { useApp } from './context/AppContext';
import { useAccounts, useChats, useMessages, useContacts } from './hooks';
import {
  AccountSidebar,
  ChatList,
  MessageList,
  MessageInput,
  AddAccountModal,
  ToastContainer,
  ContactSelector,
} from './components';
import type { Message, Contact } from './types';
import { cn } from './utils';

export function App() {
  const { state, dispatch } = useApp();
  const accounts = useAccounts();
  const chats = useChats();
  const messages = useMessages();
  const contacts = useContacts();
  
  // Reply/Forward state
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [showContactSelector, setShowContactSelector] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  
  // Load accounts on mount
  useEffect(() => {
    accounts.loadAccounts();
  }, []);
  
  // Load chats when active account changes
  useEffect(() => {
    if (accounts.activeAccount?.id && accounts.activeAccount.status === 'open') {
      chats.loadChats(true);
      contacts.loadContacts(true);
    }
  }, [accounts.activeAccount?.id, accounts.activeAccount?.status]);
  
  // Handle send message
  const handleSendMessage = async () => {
    if (editingMessage) {
      // Edit message
      await messages.editMessage(editingMessage, messages.messageInput);
      setEditingMessage(null);
      messages.setMessageInput('');
    } else if (replyingTo) {
      // Reply
      await messages.sendReply(messages.messageInput, replyingTo);
      setReplyingTo(null);
    } else {
      // Normal send
      await messages.sendMessage();
    }
  };
  
  // Handle forward
  const handleForward = async (contact: Contact) => {
    if (forwardingMessage) {
      await messages.forwardMessage(forwardingMessage, contact.id);
      setForwardingMessage(null);
      setShowContactSelector(false);
    }
  };
  
  // Handle edit
  const handleEdit = (msg: Message) => {
    setEditingMessage(msg);
    messages.setMessageInput(msg.text || msg.body || '');
  };
  
  // Cancel edit
  const cancelEdit = () => {
    setEditingMessage(null);
    messages.setMessageInput('');
  };
  
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Account Sidebar */}
      <AccountSidebar
        accounts={accounts.accounts}
        activeAccountId={accounts.activeAccountId}
        onSwitchAccount={accounts.switchAccount}
        onAddAccount={accounts.handleAddAccount}
        onDeleteAccount={accounts.deleteAccount}
        onLogout={accounts.logout}
      />
      
      {/* Chat List */}
      <ChatList
        account={accounts.activeAccount}
        chats={chats.filteredChats}
        selectedChatId={chats.selectedChatId}
        filter={chats.chatFilter}
        searchTerm={chats.chatSearchTerm}
        onSelectChat={chats.selectChat}
        onFilterChange={chats.setFilter}
        onSearchChange={chats.setSearchTerm}
        onPinChat={chats.pinChat}
        onMuteChat={chats.muteChat}
        onArchiveChat={chats.archiveChat}
        onDeleteChat={chats.deleteChat}
      />
      
      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Chat Header */}
        {chats.selectedChat && (
          <ChatHeader
            chat={chats.selectedChat}
            profilePicture={state.profilePictures.get(chats.selectedChat.id)}
          />
        )}
        
        {/* Message List */}
        <MessageList
          chat={chats.selectedChat}
          messages={messages.messages}
          isLoading={messages.isLoadingMessages}
          onReply={(msg) => setReplyingTo(msg)}
          onEdit={handleEdit}
          onDelete={(msg, forEveryone) => messages.deleteMessage(msg, forEveryone)}
          onForward={(msg) => {
            setForwardingMessage(msg);
            setShowContactSelector(true);
          }}
          onStar={(msg, star) => messages.starMessage(msg, star)}
          onCopy={messages.copyMessage}
          onReaction={(msg, emoji) => messages.sendReaction(msg, emoji)}
        />
        
        {/* Message Input */}
        {chats.selectedChat && (
          <MessageInput
            value={messages.messageInput}
            onChange={messages.setMessageInput}
            onSend={handleSendMessage}
            disabled={!accounts.activeAccount || accounts.activeAccount.status !== 'open'}
            isSending={messages.isSendingMessage}
            placeholder={
              editingMessage
                ? 'Mesajı düzenle...'
                : replyingTo
                ? 'Yanıtınızı yazın...'
                : 'Mesaj yazın...'
            }
            replyingTo={
              replyingTo
                ? {
                    text: replyingTo.text || replyingTo.body || '',
                    onCancel: () => setReplyingTo(null),
                  }
                : editingMessage
                ? {
                    text: `Düzenleniyor: ${editingMessage.text || editingMessage.body || ''}`,
                    onCancel: cancelEdit,
                  }
                : null
            }
          />
        )}
      </div>
      
      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={accounts.showAddModal}
        qrCode={accounts.qrCode}
        isLoading={accounts.isLoadingQR}
        accountName={accounts.newAccountName}
        onAccountNameChange={accounts.setNewAccountName}
        onClose={accounts.closeAddModal}
      />
      
      {/* Contact Selector for Forward */}
      <ContactSelector
        isOpen={showContactSelector}
        contacts={contacts.contactsArray}
        chats={chats.chats}
        profilePictures={state.profilePictures}
        title="Mesajı İlet"
        onSelect={handleForward}
        onSelectChat={(chatId) => {
          if (forwardingMessage) {
            messages.forwardMessage(forwardingMessage, chatId);
            setForwardingMessage(null);
            setShowContactSelector(false);
          }
        }}
        onClose={() => {
          setShowContactSelector(false);
          setForwardingMessage(null);
        }}
      />
      
      {/* Toast Container */}
      <ToastContainer
        toasts={state.toasts}
        onClose={(id) => dispatch({ type: 'REMOVE_TOAST', payload: id })}
      />
      
      {/* Connection Status */}
      {state.connectionState.status !== 'connected' && (
        <ConnectionIndicator status={state.connectionState.status} />
      )}
    </div>
  );
}

// Chat Header Component
function ChatHeader({
  chat,
  profilePicture,
}: {
  chat: { id: string; name: string; profilePicture?: string | null };
  profilePicture?: string;
}) {
  return (
    <div className="bg-gray-100 border-b px-4 py-3 flex items-center gap-3">
      {/* Avatar */}
      {chat.profilePicture || profilePicture ? (
        <img
          src={chat.profilePicture || profilePicture}
          alt={chat.name}
          className="w-10 h-10 rounded-full object-cover"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold">
          {chat.name.charAt(0).toUpperCase()}
        </div>
      )}
      
      {/* Info */}
      <div className="flex-1">
        <h2 className="font-semibold text-gray-800">{chat.name}</h2>
        <p className="text-xs text-gray-500">
          {chat.id.includes('@g.us') ? 'Grup' : 'Kişi'}
        </p>
      </div>
    </div>
  );
}

// Connection Indicator Component
function ConnectionIndicator({ status }: { status: string }) {
  const statusText = {
    disconnected: 'Bağlantı kesildi',
    connecting: 'Bağlanıyor...',
    reconnecting: 'Yeniden bağlanıyor...',
    error: 'Bağlantı hatası',
  }[status] || status;
  
  const statusColor = {
    disconnected: 'bg-red-500',
    connecting: 'bg-yellow-500',
    reconnecting: 'bg-yellow-500',
    error: 'bg-red-500',
  }[status] || 'bg-gray-500';
  
  return (
    <div className={cn('fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white text-sm shadow-lg z-50', statusColor)}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
        {statusText}
      </div>
    </div>
  );
}

