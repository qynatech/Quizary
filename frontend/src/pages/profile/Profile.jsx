import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Camera, Lock } from 'lucide-react'
import api from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { Card, Button, Input, PageHeader } from '../../components/ui'
import ChangePasswordModal from './ChangePasswordModal'
import { resolveMediaUrl } from '../../lib/media'
import { usePageTour } from '../../features/tour/TourContext'

export default function Profile() {
  const { user, updateUser } = useAuth()
  const toast = useToast()
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [openPassword, setOpenPassword] = useState(false)
  const fileRef = useRef(null)

  usePageTour('profile', {
    variant: 'default',
    steps: [
      { target: '[data-tour="profile-avatar"]', title: 'Make your profile yours', content: 'Upload a photo so teammates and respondents recognize you.', placement: 'right' },
      { target: '[data-tour="profile-details"]', title: 'Update your details', content: 'Keep your display name current. Your email is managed from your account security settings.', placement: 'left' },
      { target: '[data-tour="profile-security"]', title: 'Secure your account', content: 'Open the password flow here, then save your profile changes when you are done.', placement: 'top' },
    ],
  })

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setAvatarPreview(user.avatar || null)
    }
  }, [user])

  const handleSave = async () => {
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('name', name)
      const res = await api.put('/me', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      updateUser(res.data)
      toast.success(t('profile.saved'))
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.detail || t('profile.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAvatar(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleUploadAvatar = async () => {
    if (!avatar) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('avatar', avatar)
      const res = await api.post('/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      updateUser(res.data)
      setAvatarPreview(res.data.avatar)
      setAvatar(null)
      toast.success(t('profile.avatarSaved'))
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.detail || t('profile.avatarFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        eyebrow={t('profile.eyebrow')}
        title={t('profile.title')}
        description={t('profile.description')}
      />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
        <Card data-tour="profile-details" className="p-6 md:p-8">
          <div data-tour="profile-avatar" className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 dark:bg-ink-800 border-4 border-white dark:border-ink-800 shadow-lift">
                {avatarPreview ? (
                  <img src={resolveMediaUrl(avatarPreview)} alt={t('profile.changeAvatar')} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-display text-3xl font-bold text-gray-400 dark:text-gray-300 bg-primary-50 dark:bg-primary-900/30">
                    {(user?.name || 'U')[0].toUpperCase()}
                  </div>
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                aria-label={t('profile.changeAvatar')}
                className="absolute -bottom-1 -right-1 w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center shadow-chip hover:bg-primary-600 active:scale-95 transition-all"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </div>
            {avatar && (
              <div className="flex gap-2">
                <Button size="sm" onClick={handleUploadAvatar} loading={uploading}>{t('profile.saveAvatar')}</Button>
             <Button
               data-tour="profile-security"
               variant="ghost"

                  size="sm"
                  onClick={() => { setAvatar(null); setAvatarPreview(user?.avatar || null) }}
                >
                  {t('profile.cancel')}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <Input
              label={t('profile.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('profile.namePlaceholder')}
            />

            <Input
              label={t('profile.email')}
              value={user?.email || ''}
              readOnly
              className="bg-gray-50 dark:bg-ink-800 text-gray-500 cursor-not-allowed"
            />

            <Button
              variant="ghost"
              className="w-full"
              icon={<Lock className="w-4 h-4" />}
              onClick={() => setOpenPassword(true)}
            >
              {t('profile.password.open')}
            </Button>

            <Button onClick={handleSave} loading={saving} className="w-full" size="lg">
              {t('profile.saveProfile')}
            </Button>
          </div>
        </Card>
      </motion.div>

      <ChangePasswordModal show={openPassword} onClose={() => setOpenPassword(false)} />
    </div>
  )
}
